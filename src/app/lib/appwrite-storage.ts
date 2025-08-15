import { Client, Storage, ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { z } from 'zod';

export interface StorageConfig {
  endpoint: string;
  projectId: string;
  bucketId: string;
  apiKey: string;
}

export interface StoredFile {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string; // view URL
  downloadUrl: string;
}

export interface UploadOptions {
  fileName: string;
  mimeType: string;
  makePublic?: boolean;
}

export class AppwriteStorageService {
  private client: Client;
  private storage: Storage;
  private bucketId: string;

  constructor(config: StorageConfig) {
    this.client = new Client()
      .setEndpoint(config.endpoint)
      .setProject(config.projectId)
      .setKey(config.apiKey);
    
    this.storage = new Storage(this.client);
    this.bucketId = config.bucketId;
  }

  private toUrlString(value: any): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    try {
      // Some SDKs return URL or Response-like objects; try common props
      if (value.href) return String(value.href);
      if (value.toString) return String(value.toString());
    } catch {}
    return String(value);
  }

  async uploadFile(
    file: ArrayBuffer | Buffer,
    options: UploadOptions
  ): Promise<StoredFile> {
    try {
      const fileId = ID.unique();

      const buffer = file instanceof Buffer
        ? file
        : Buffer.from(new Uint8Array(file));

      const input = InputFile.fromBuffer(buffer, options.fileName);

      const permissions = options.makePublic !== false
        ? [Permission.read(Role.any())]
        : undefined;

      await this.storage.createFile(
        this.bucketId,
        fileId,
        input,
        permissions
      );

      const fileDetails = await this.storage.getFile(this.bucketId, fileId);

      const viewUrl = this.toUrlString(this.storage.getFileView(this.bucketId, fileId));
      const downloadUrl = this.toUrlString(this.storage.getFileDownload(this.bucketId, fileId));

      return {
        id: fileDetails.$id,
        name: fileDetails.name,
        size: (fileDetails as any).sizeOriginal ?? 0,
        mimeType: fileDetails.mimeType,
        url: viewUrl,
        downloadUrl,
      };

    } catch (error) {
      console.error('Error uploading file to Appwrite:', error);
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async makeFilePublic(fileId: string): Promise<void> {
    try {
      const existing = await this.storage.getFile(this.bucketId, fileId);
      await this.storage.updateFile(
        this.bucketId,
        fileId,
        existing.name,
        [Permission.read(Role.any())]
      );
    } catch (error) {
      console.error('Error making file public:', error);
    }
  }

  async getFile(fileId: string): Promise<StoredFile | null> {
    try {
      const file = await this.storage.getFile(this.bucketId, fileId);
      const viewUrl = this.toUrlString(this.storage.getFileView(this.bucketId, fileId));
      const downloadUrl = this.toUrlString(this.storage.getFileDownload(this.bucketId, fileId));
      
      return {
        id: file.$id,
        name: file.name,
        size: (file as any).sizeOriginal ?? 0,
        mimeType: file.mimeType,
        url: viewUrl,
        downloadUrl,
      };
    } catch (error) {
      console.error('Error getting file from Appwrite:', error);
      return null;
    }
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.storage.deleteFile(this.bucketId, fileId);
    } catch (error) {
      console.error('Error deleting file from Appwrite:', error);
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async listFiles(queries?: string[]): Promise<StoredFile[]> {
    try {
      const result = await this.storage.listFiles(this.bucketId, queries);
      
      return await Promise.all(result.files.map(async (file) => {
        const viewUrl = this.toUrlString(this.storage.getFileView(this.bucketId, file.$id));
        const downloadUrl = this.toUrlString(this.storage.getFileDownload(this.bucketId, file.$id));
        return {
          id: file.$id,
          name: file.name,
          size: (file as any).sizeOriginal ?? 0,
          mimeType: file.mimeType,
          url: viewUrl,
          downloadUrl,
        } as StoredFile;
      }));
    } catch (error) {
      console.error('Error listing files from Appwrite:', error);
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async searchFiles(query: string): Promise<StoredFile[]> {
    try {
      const result = await this.storage.listFiles(this.bucketId, [
        `name.search("${query}")`,
      ]);
      
      return await Promise.all(result.files.map(async (file) => {
        const viewUrl = this.toUrlString(this.storage.getFileView(this.bucketId, file.$id));
        const downloadUrl = this.toUrlString(this.storage.getFileDownload(this.bucketId, file.$id));
        return {
          id: file.$id,
          name: file.name,
          size: (file as any).sizeOriginal ?? 0,
          mimeType: file.mimeType,
          url: viewUrl,
          downloadUrl,
        } as StoredFile;
      }));
    } catch (error) {
      console.error('Error searching files in Appwrite:', error);
      throw new Error(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getFileDownloadUrl(fileId: string): Promise<string> {
    try {
      return this.toUrlString(this.storage.getFileDownload(this.bucketId, fileId));
    } catch (error) {
      console.error('Error getting file download URL:', error);
      throw new Error(`Failed to get download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getFilePreview(fileId: string, width?: number, height?: number): Promise<string> {
    try {
      return this.toUrlString(this.storage.getFilePreview(
        this.bucketId,
        fileId,
        width,
        height
      ));
    } catch (error) {
      console.error('Error getting file preview:', error);
      throw new Error(`Failed to get file preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Configuration schema
export const StorageConfigSchema = z.object({
  endpoint: z.string().url(),
  projectId: z.string(),
  bucketId: z.string(),
  apiKey: z.string(),
});

// Environment variable helper
export function getStorageConfig(): StorageConfig {
  const config = {
    endpoint: process.env.APPWRITE_ENDPOINT!,
    projectId: process.env.APPWRITE_PROJECT_ID!,
    bucketId: process.env.APPWRITE_BUCKET_ID!,
    apiKey: process.env.APPWRITE_API_KEY!,
  };

  return StorageConfigSchema.parse(config);
}

// Singleton instance
let storageInstance: AppwriteStorageService | null = null;

export async function getStorageService(): Promise<AppwriteStorageService> {
  if (!storageInstance) {
    const config = getStorageConfig();
    storageInstance = new AppwriteStorageService(config);
  }
  return storageInstance;
}

