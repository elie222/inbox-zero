import { auth, drive, type drive_v3 } from "@googleapis/drive";
import { Readable } from "node:stream";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { createScopedLogger } from "@/utils/logger";
import type {
  DriveProvider,
  DriveFolder,
  DriveFile,
  UploadFileParams,
} from "@/utils/drive/types";

/**
 * Google Drive provider using Google Drive API v3
 * Implements DriveProvider interface for consistent abstraction
 *
 * Note: Requires @googleapis/drive package to be installed:
 * pnpm add @googleapis/drive --filter web
 */
export class GoogleDriveProvider implements DriveProvider {
  readonly name = "google" as const;
  private readonly client: drive_v3.Drive;
  private readonly accessToken: string;
  private readonly logger: Logger;

  constructor(accessToken: string, logger?: Logger) {
    this.accessToken = accessToken;
    this.logger = (logger || createScopedLogger("google-drive-provider")).with({
      provider: "google",
    });

    const googleAuth = new auth.OAuth2({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    });
    googleAuth.setCredentials({
      access_token: accessToken,
    });

    this.client = drive({ version: "v3", auth: googleAuth });
  }

  toJSON() {
    return { name: this.name, type: "GoogleDriveProvider" };
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  // -------------------------------------------------------------------------
  // Folder Operations
  // -------------------------------------------------------------------------

  async listFolders(parentId?: string): Promise<DriveFolder[]> {
    this.logger.trace("Listing folders", { parentId });

    try {
      // If no parentId, fetch ALL folders for better initial experience
      const parent = parentId || null;
      const query = parent
        ? `'${parent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        : "mimeType = 'application/vnd.google-apps.folder' and trashed = false";

      const response = await this.client.files.list({
        q: query,
        fields: "nextPageToken, files(id, name, parents, webViewLink)",
        pageSize: parent ? 100 : 1000,
        orderBy: "name",
      });

      const files = response.data.files || [];

      return files.map((file) => this.convertToFolder(file));
    } catch (error) {
      this.logger.error("Error listing folders", { error, parentId });
      throw error;
    }
  }

  async getFolder(folderId: string): Promise<DriveFolder | null> {
    this.logger.trace("Getting folder", { folderId });

    try {
      const response = await this.client.files.get({
        fileId: folderId,
        fields: "id, name, parents, webViewLink, mimeType",
      });

      const file = response.data;

      // Check if it's actually a folder
      if (file.mimeType !== "application/vnd.google-apps.folder") {
        this.logger.warn("Item is not a folder", { folderId });
        return null;
      }

      return this.convertToFolder(file);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        this.logger.trace("Folder not found", { folderId });
        return null;
      }
      this.logger.error("Error getting folder", { error, folderId });
      throw error;
    }
  }

  async createFolder(name: string, parentId?: string): Promise<DriveFolder> {
    this.logger.info("Creating folder", { name, parentId });

    try {
      const response = await this.client.files.create({
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: parentId ? [parentId] : undefined,
        },
        fields: "id, name, parents, webViewLink",
      });

      return this.convertToFolder(response.data);
    } catch (error) {
      this.logger.error("Error creating folder", { error, name, parentId });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // File Operations
  // -------------------------------------------------------------------------

  async uploadFile(params: UploadFileParams): Promise<DriveFile> {
    const { filename, mimeType, content, folderId } = params;
    this.logger.info("Uploading file", {
      filename,
      mimeType,
      folderId,
      size: content.length,
    });

    try {
      // Convert Buffer to Readable stream for the API
      const stream = Readable.from(content);

      const response = await this.client.files.create({
        requestBody: {
          name: filename,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: "id, name, mimeType, size, parents, webViewLink, createdTime",
      });

      return this.convertToFile(response.data);
    } catch (error) {
      this.logger.error("Error uploading file", { error, filename, folderId });
      throw error;
    }
  }

  async getFile(fileId: string): Promise<DriveFile | null> {
    this.logger.trace("Getting file", { fileId });

    try {
      const response = await this.client.files.get({
        fileId,
        fields: "id, name, mimeType, size, parents, webViewLink, createdTime",
      });

      const file = response.data;

      // Check it's not a folder
      if (file.mimeType === "application/vnd.google-apps.folder") {
        this.logger.warn("Item is a folder, not a file", { fileId });
        return null;
      }

      return this.convertToFile(file);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        this.logger.trace("File not found", { fileId });
        return null;
      }
      this.logger.error("Error getting file", { error, fileId });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private convertToFolder(file: drive_v3.Schema$File): DriveFolder {
    return {
      id: file.id!,
      name: file.name || "Untitled",
      parentId: file.parents?.[0] ?? undefined,
      // Google Drive doesn't provide full path directly, would need recursive calls
      path: undefined,
      webUrl: file.webViewLink ?? undefined,
    };
  }

  private convertToFile(file: drive_v3.Schema$File): DriveFile {
    return {
      id: file.id!,
      name: file.name || "Untitled",
      mimeType: file.mimeType || "application/octet-stream",
      size: file.size ? Number.parseInt(file.size) : undefined,
      folderId: file.parents?.[0] ?? undefined,
      webUrl: file.webViewLink ?? undefined,
      createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
    };
  }

  private isNotFoundError(error: unknown): boolean {
    if (error && typeof error === "object" && "code" in error) {
      return (error as { code: number }).code === 404;
    }
    if (error && typeof error === "object" && "status" in error) {
      return (error as { status: number }).status === 404;
    }
    return false;
  }
}
