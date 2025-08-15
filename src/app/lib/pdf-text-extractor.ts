export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  // Backwards-compatible export; now returns structured Markdown
  return extractMarkdownFromPdf(buffer);
}

export async function extractMarkdownFromPdf(buffer: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // Ensure worker can be resolved in Node/Next server by pointing to module path
  try {
    (pdfjs as any).GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
  } catch {
    // ignore if not available
  }
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useWorkerFetch: false,
    isOffscreenCanvasSupported: false,
  });

  const doc = await loadingTask.promise;
  const numPages = doc.numPages;
  const markdownPages: string[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const textContent: any = await page.getTextContent();
    const items: any[] = textContent.items ?? [];

    // Normalize items with computed positions and font sizes
    type NormalizedItem = {
      text: string;
      x: number;
      y: number;
      fontSize: number;
      bold: boolean;
      hasEOL: boolean;
    };

    const normalized: NormalizedItem[] = items
      .filter((it) => it && typeof it.str === 'string')
      .map((it) => {
        const t = Array.isArray(it.transform) ? it.transform : [1, 0, 0, 1, 0, 0];
        const a = Number(t[0]) || 0;
        const b = Number(t[1]) || 0;
        const x = Number(t[4]) || 0;
        const y = Number(t[5]) || 0;
        const fontSize = Math.max(1, Math.hypot(a, b));
        const fontName = String(it.fontName || '');
        const bold = /bold/i.test(fontName);
        const hasEOL = Boolean(it.hasEOL);
        return { text: String(it.str), x, y, fontSize, bold, hasEOL };
      });

    // Group into lines by Y coordinate proximity
    const yTolerance = 2.5;
    normalized.sort((a, b) => (a.y === b.y ? a.x - b.x : b.y - a.y)); // top-to-bottom, then left-to-right

    const lines: Array<{
      y: number;
      items: NormalizedItem[];
    }> = [];

    for (const it of normalized) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(last.y - it.y) <= yTolerance) {
        last.items.push(it);
      } else {
        lines.push({ y: it.y, items: [it] });
      }
    }

    // Compute page-wide font size stats
    const lineFontSizes = lines.map((ln) => average(ln.items.map((i) => i.fontSize)));
    const mean = average(lineFontSizes);
    const std = standardDeviation(lineFontSizes, mean);

    const toMarkdownLine = (ln: { items: NormalizedItem[] }): string => {
      ln.items.sort((a, b) => a.x - b.x);
      const lineTextRaw = ln.items.map((i) => i.text).join(' ').replace(/\s+/g, ' ').trim();
      if (!lineTextRaw) return '';

      const lineFont = average(ln.items.map((i) => i.fontSize));
      const isBold = ln.items.some((i) => i.bold);

      // Heuristics: Identify headings by significantly larger font size
      let prefix = '';
      if (lineFont >= mean + 2 * std) prefix = '# ';
      else if (lineFont >= mean + 1.2 * std) prefix = '## ';
      else prefix = '';

      // Identify bullets / ordered lists
      const bulletLike = /^[\u2022\u25E6\u25AA\-\*\+]\s+/.test(lineTextRaw);
      const orderedLike = /^\d+\.[\)\.]?\s+/.test(lineTextRaw);

      if (!prefix && (bulletLike || orderedLike)) {
        return bulletLike ? `- ${lineTextRaw.replace(/^[\u2022\u25E6\u25AA\-\*\+]\s+/, '')}` : lineTextRaw;
      }

      if (prefix) {
        return `${prefix}${lineTextRaw}`;
      }

      // Emphasize bold-only lines
      if (isBold && lineTextRaw.length <= 120) {
        return `**${lineTextRaw}**`;
      }

      return lineTextRaw;
    };

    const pageMdLines = lines.map(toMarkdownLine).filter(Boolean);
    markdownPages.push(pageMdLines.join('\n'));
  }

  try {
    await doc.cleanup();
    await doc.destroy();
  } catch {
    // ignore cleanup errors
  }

  return markdownPages.join('\n\n');
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function standardDeviation(values: number[], meanVal?: number): number {
  if (values.length <= 1) return 0;
  const mu = meanVal ?? average(values);
  const variance = average(values.map((v) => (v - mu) * (v - mu)));
  return Math.sqrt(variance);
}


