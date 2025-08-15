import mammoth from 'mammoth';
import pdf from 'pdf-parse';
import TurndownService from 'turndown';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { parseStringPromise } from 'xml2js';
import { isSupportedContentType } from './content-types';
import { correctMimeType } from './mime-utils';

export interface ProcessedDocument {
  content: string;
  metadata: Record<string, any>;
  chunks: DocumentChunk[];
}

export interface DocumentChunk {
  content: string;
  metadata: Record<string, any>;
  chunkIndex: number;
}

export class DocumentProcessor {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
  }

  async processDocument(
    buffer: ArrayBuffer,
    contentType: string,
    metadata: Record<string, any>
  ): Promise<ProcessedDocument> {
    let content = '';
    
    // Use corrected content type for better detection
    const fileName = metadata?.fileName || metadata?.documentName || '';
    const correctedType = correctMimeType(contentType, fileName);
    const ct = correctedType.toLowerCase();

    try {
      if (ct.includes('pdf')) {
        content = await this.extractPdfText(buffer);
      } else if (ct.includes('word') || ct.includes('docx') || ct.includes('msword')) {
        content = await this.extractWordText(buffer);
      } else if (ct.includes('presentation') || ct.includes('pptx') || ct.includes('powerpoint')) {
        content = await this.extractPowerPointText(buffer);
      } else if (ct.includes('spreadsheet') || ct.includes('xlsx') || ct.includes('excel')) {
        content = await this.extractExcelText(buffer);
      } else if (ct.includes('csv')) {
        content = await this.extractCsvText(buffer);
      } else if (ct.includes('html')) {
        content = await this.extractHtmlText(buffer);
      } else if (ct.includes('markdown')) {
        content = await this.extractTextContent(buffer);
      } else if (ct.includes('text')) {
        content = await this.extractTextContent(buffer);
      } else {
        throw new Error(`Unsupported content type: ${correctedType} (original: ${contentType})`);
      }

      const normalized = this.cleanText(content);
      const chunks = this.createChunks(normalized, metadata);
      
      return {
        content,
        metadata,
        chunks,
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async extractPdfText(buffer: ArrayBuffer): Promise<string> {
    try {
      const result = await pdf(Buffer.from(buffer));
      return result.text;
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  private async extractWordText(buffer: ArrayBuffer): Promise<string> {
    try {
      const nodeBuffer = Buffer.from(buffer as ArrayBuffer);
      const result = await mammoth.extractRawText({ buffer: nodeBuffer });
      return result.value;
    } catch (error) {
      console.error('Error extracting Word text:', error);
      throw new Error('Failed to extract text from Word document');
    }
  }

  private async extractPowerPointText(buffer: ArrayBuffer): Promise<string> {
    try {
      const zip = await JSZip.loadAsync(Buffer.from(buffer as ArrayBuffer));
      // PPTX slide texts are in ppt/slides/slideN.xml
      const slideFiles = Object.keys(zip.files).filter((f) => f.startsWith('ppt/slides/slide') && f.endsWith('.xml'));
      const texts: string[] = [];
      for (const file of slideFiles) {
        const xml = await zip.file(file)!.async('string');
        const parsed = await parseStringPromise(xml);
        // Extract all text runs <a:t>
        const runs: string[] = [];
        const walk = (obj: any) => {
          if (!obj || typeof obj !== 'object') return;
          if (obj['a:t']) {
            const val = Array.isArray(obj['a:t']) ? obj['a:t'].join(' ') : String(obj['a:t']);
            runs.push(val);
          }
          for (const key of Object.keys(obj)) walk(obj[key]);
        };
        walk(parsed);
        if (runs.length) texts.push(runs.join(' '));
      }
      return texts.join('\n\n');
    } catch (error) {
      console.error('Error extracting PowerPoint text:', error);
      throw new Error('Failed to extract text from PowerPoint');
    }
  }

  private async extractExcelText(buffer: ArrayBuffer): Promise<string> {
    try {
      const wb = XLSX.read(Buffer.from(buffer as ArrayBuffer), { type: 'buffer' });
      const pieces: string[] = [];
      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
        if (csv.trim().length > 0) {
          pieces.push(`# ${sheetName}\n${csv}`);
        }
      }
      return pieces.join('\n\n');
    } catch (error) {
      console.error('Error extracting Excel text:', error);
      throw new Error('Failed to extract text from Excel');
    }
  }

  private async extractCsvText(buffer: ArrayBuffer): Promise<string> {
    try {
      // Decode and return as-is; consumers can render tabs/newlines meaningfully
      const text = new TextDecoder().decode(buffer);
      return text;
    } catch (error) {
      console.error('Error extracting CSV text:', error);
      throw new Error('Failed to extract text from CSV');
    }
  }

  private async extractHtmlText(buffer: ArrayBuffer): Promise<string> {
    try {
      const text = new TextDecoder().decode(buffer);
      return this.turndownService.turndown(text);
    } catch (error) {
      console.error('Error extracting HTML text:', error);
      throw new Error('Failed to extract text from HTML');
    }
  }

  private async extractTextContent(buffer: ArrayBuffer): Promise<string> {
    try {
      return new TextDecoder().decode(buffer);
    } catch (error) {
      console.error('Error extracting text content:', error);
      throw new Error('Failed to extract text content');
    }
  }

  private createChunks(content: string, metadata: Record<string, any>): DocumentChunk[] {
    // First, try structure-aware chunking for legal/statutory documents
    const structureAwareChunks = this.createStructureAwareChunks(content, metadata);
    if (structureAwareChunks.length > 0) {
      console.log(`Created ${structureAwareChunks.length} structure-aware chunks`);
      return structureAwareChunks;
    }

    // Fallback to improved semantic chunking
    return this.createSemanticChunks(content, metadata);
  }

  private createStructureAwareChunks(content: string, metadata: Record<string, any>): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    let chunkIndex = 0;

    // Patterns for legal/statutory document structures
    const sectionPatterns = [
      // Norwegian patterns
      /(?:^|\n)\s*(§\s*\d+(?:\.\d+)*(?:\.\d+)*)\s*([^\n]*?)(?=\n|$)/gm, // § 6.3, § 6.3.1
      /(?:^|\n)\s*(paragraf\s+\d+(?:\.\d+)*)\s*([^\n]*?)(?=\n|$)/gim,
      /(?:^|\n)\s*(avsnitt\s+\d+(?:\.\d+)*)\s*([^\n]*?)(?=\n|$)/gim,
      
      // English patterns  
      /(?:^|\n)\s*(section\s+\d+(?:\.\d+)*)\s*([^\n]*?)(?=\n|$)/gim,
      /(?:^|\n)\s*(paragraph\s+\d+(?:\.\d+)*)\s*([^\n]*?)(?=\n|$)/gim,
      /(?:^|\n)\s*(article\s+\d+(?:\.\d+)*)\s*([^\n]*?)(?=\n|$)/gim,
      
      // Numbered sections
      /(?:^|\n)\s*(\d+(?:\.\d+)*)\s+([A-ZÆØÅ][^\n]*?)(?=\n|$)/gm, // 6.3 Title
    ];

    const foundSections: Array<{
      number: string;
      title: string;
      startPos: number;
      endPos: number;
      fullMatch: string;
    }> = [];

    // Find all section headers
    for (const pattern of sectionPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        foundSections.push({
          number: match[1].trim(),
          title: match[2].trim(),
          startPos: match.index,
          endPos: match.index + match[0].length,
          fullMatch: match[0],
        });
      }
    }

    // Sort sections by position
    foundSections.sort((a, b) => a.startPos - b.startPos);

    if (foundSections.length === 0) {
      return []; // No structure found, use fallback
    }

    console.log(`Found ${foundSections.length} structured sections`);

    // Create chunks based on sections
    for (let i = 0; i < foundSections.length; i++) {
      const section = foundSections[i];
      const nextSection = foundSections[i + 1];
      
      // Determine the end of this section's content
      const contentStart = section.startPos;
      const contentEnd = nextSection ? nextSection.startPos : content.length;
      
      // Extract the full section content
      let sectionContent = content.substring(contentStart, contentEnd).trim();
      
      // Ensure we have meaningful content (not just headers)
      if (sectionContent.length < 50) {
        // If section is too short, try to extend it a bit
        const extendedEnd = Math.min(contentEnd + 500, content.length);
        sectionContent = content.substring(contentStart, extendedEnd).trim();
      }

      // For very long sections, split them but preserve the header
      if (sectionContent.length > 2000) {
        const subChunks = this.splitLongSection(sectionContent, section.number, section.title, contentStart);
        chunks.push(...subChunks.map(chunk => ({
          ...chunk,
          chunkIndex: chunkIndex++,
        })));
      } else {
        chunks.push({
          content: sectionContent,
          metadata: {
            ...metadata,
            chunkIndex,
            startChar: contentStart,
            endChar: contentEnd,
            sectionNumber: section.number,
            sectionTitle: section.title,
            isStructured: true,
            chunkType: 'section',
          },
          chunkIndex,
        });
        chunkIndex++;
      }
    }

    return chunks;
  }

  private splitLongSection(
    sectionContent: string, 
    sectionNumber: string, 
    sectionTitle: string, 
    baseStartPos: number
  ): Omit<DocumentChunk, 'chunkIndex'>[] {
    const chunks: Omit<DocumentChunk, 'chunkIndex'>[] = [];
    const maxChunkSize = 1500;
    const overlap = 200;

    // Always keep the section header in the first chunk
    const lines = sectionContent.split('\n');
    const header = lines[0]; // Section header line
    let currentChunk = header + '\n';
    let currentStart = baseStartPos;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const potentialChunk = currentChunk + line + '\n';

      if (potentialChunk.length > maxChunkSize && currentChunk.length > header.length + 100) {
        // Save current chunk
        chunks.push({
          content: currentChunk.trim(),
          metadata: {
            sectionNumber,
            sectionTitle,
            isStructured: true,
            chunkType: 'section_part',
            partIndex: chunks.length,
            startChar: currentStart,
            endChar: currentStart + currentChunk.length,
          },
        });

        // Start new chunk with header + overlap
        const overlapLines = lines.slice(Math.max(0, i - 3), i); // Include some previous context
        currentChunk = header + '\n' + overlapLines.join('\n') + '\n' + line + '\n';
        currentStart = currentStart + currentChunk.length - overlap;
      } else {
        currentChunk = potentialChunk;
      }
    }

    // Add the final chunk if it has content
    if (currentChunk.length > header.length + 50) {
      chunks.push({
        content: currentChunk.trim(),
        metadata: {
          sectionNumber,
          sectionTitle,
          isStructured: true,
          chunkType: 'section_part',
          partIndex: chunks.length,
          startChar: currentStart,
          endChar: currentStart + currentChunk.length,
        },
      });
    }

    return chunks;
  }

  private createSemanticChunks(content: string, metadata: Record<string, any>): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const chunkSize = 1200; // Slightly larger for better context
    const overlap = 300; // More overlap for better continuity

    let startIndex = 0;
    let chunkIndex = 0;

    while (startIndex < content.length) {
      const endIndex = Math.min(startIndex + chunkSize, content.length);
      let chunkContent = content.substring(startIndex, endIndex);

      // Improved boundary detection
      if (endIndex < content.length) {
        const boundaries = [
          chunkContent.lastIndexOf('\n\n'), // Paragraph break
          chunkContent.lastIndexOf('. '),    // Sentence end
          chunkContent.lastIndexOf('.\n'),   // Sentence end with newline
          chunkContent.lastIndexOf('\n'),    // Any newline
        ];

        const bestBoundary = boundaries.find(pos => pos > startIndex + chunkSize * 0.6);
        
        if (bestBoundary && bestBoundary > 0) {
          chunkContent = content.substring(startIndex, startIndex + bestBoundary + 1);
          startIndex = startIndex + bestBoundary + 1;
        } else {
          startIndex = endIndex;
        }
      } else {
        startIndex = endIndex;
      }

      const trimmedContent = chunkContent.trim();
      if (trimmedContent.length > 50) { // Only add chunks with meaningful content
        chunks.push({
          content: trimmedContent,
          metadata: {
            ...metadata,
            chunkIndex,
            startChar: startIndex - chunkContent.length,
            endChar: startIndex,
            isStructured: false,
            chunkType: 'semantic',
          },
          chunkIndex,
        });
        chunkIndex++;
      }
      
      // Apply overlap for continuity
      if (startIndex < content.length) {
        startIndex = Math.max(0, startIndex - overlap);
      }
    }

    return chunks;
  }

  cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
      .replace(/\n+/g, '\n') // Replace multiple newlines with single newline
      .trim();
  }
}

