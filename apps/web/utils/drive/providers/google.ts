import { auth, drive, type drive_v3 } from "@googleapis/drive";
import { Readable } from "node:stream";
import type { Logger } from "@/utils/logger";
import { createScopedLogger } from "@/utils/logger";
import {
  getGoogleApiRootUrl,
  getGoogleOauthClientOptions,
} from "@/utils/google/oauth";
import type {
  DriveProvider,
  DriveFolder,
  DriveFile,
  UploadFileParams,
} from "@/utils/drive/types";

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

    const googleAuth = new auth.OAuth2(getGoogleOauthClientOptions());
    googleAuth.setCredentials({
      access_token: accessToken,
    });

    this.client = drive({
      version: "v3",
      auth: googleAuth,
      rootUrl: getGoogleApiRootUrl(),
    });
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
      const escapedParent = parentId
        ? this.escapeDriveQueryValue(parentId)
        : null;
      const query = escapedParent
        ? `'${escapedParent}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
        : "'root' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false";

      const allFiles: drive_v3.Schema$File[] = [];
      let pageToken: string | undefined;

      do {
        const response = await this.client.files.list({
          q: query,
          fields: "nextPageToken, files(id, name, parents, webViewLink)",
          pageSize: 200,
          orderBy: "name",
          pageToken,
        });

        const files = response.data.files || [];
        allFiles.push(...files);
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);

      return allFiles.map((file) => this.convertToFolder(file));
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
        fields: "id, name, parents, webViewLink, mimeType, trashed",
      });

      const file = response.data;

      if (file.trashed) {
        return null;
      }

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
        fields:
          "id, name, mimeType, size, parents, webViewLink, createdTime, modifiedTime",
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

  async listFiles(
    parentId?: string,
    options?: { mimeTypes?: string[] },
  ): Promise<DriveFile[]> {
    this.logger.trace("Listing files", {
      parentId,
      mimeTypes: options?.mimeTypes,
    });

    const parentQuery = parentId
      ? `'${this.escapeDriveQueryValue(parentId)}' in parents`
      : "'root' in parents";
    const mimeTypeQuery = options?.mimeTypes?.length
      ? ` and (${options.mimeTypes
          .map(
            (mimeType) =>
              `mimeType = '${this.escapeDriveQueryValue(mimeType)}'`,
          )
          .join(" or ")})`
      : " and mimeType != 'application/vnd.google-apps.folder'";
    const query = `${parentQuery}${mimeTypeQuery} and trashed = false`;

    const files: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.client.files.list({
        q: query,
        fields:
          "nextPageToken, files(id, name, mimeType, size, parents, webViewLink, createdTime, modifiedTime)",
        pageSize: 200,
        orderBy: "name",
        pageToken,
      });

      files.push(...(response.data.files || []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    return files.map((file) => this.convertToFile(file));
  }

  async downloadFile(
    fileId: string,
  ): Promise<{ content: Buffer; file: DriveFile } | null> {
    const file = await this.getFile(fileId);
    if (!file) return null;

    const response = await this.client.files.get(
      { fileId, alt: "media" },
      { responseType: "arraybuffer" },
    );

    return {
      file,
      content: Buffer.from(response.data as ArrayBuffer),
    };
  }

  async moveFile(fileId: string, targetFolderId: string): Promise<DriveFile> {
    this.logger.info("Moving file", { fileId, targetFolderId });

    try {
      // First get current parents
      const file = await this.client.files.get({
        fileId,
        fields: "parents",
      });

      const previousParents = file.data.parents?.join(",") || "";

      // Move by updating parents
      const response = await this.client.files.update({
        fileId,
        addParents: targetFolderId,
        removeParents: previousParents,
        fields: "id, name, mimeType, size, parents, webViewLink, createdTime",
      });

      this.logger.info("File moved", { fileId, targetFolderId });
      return this.convertToFile(response.data);
    } catch (error) {
      this.logger.error("Error moving file", { error, fileId, targetFolderId });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private convertToFolder(file: drive_v3.Schema$File): DriveFolder {
    if (!file.id) {
      throw new Error("Drive folder is missing id");
    }
    return {
      id: file.id,
      name: file.name || "Untitled",
      parentId: file.parents?.[0] ?? undefined,
      // Google Drive doesn't provide full path directly, would need recursive calls
      path: undefined,
      webUrl: file.webViewLink ?? undefined,
    };
  }

  private convertToFile(file: drive_v3.Schema$File): DriveFile {
    if (!file.id) {
      throw new Error("Drive file is missing id");
    }
    return {
      id: file.id,
      name: file.name || "Untitled",
      mimeType: file.mimeType || "application/octet-stream",
      size: file.size ? Number.parseInt(file.size) : undefined,
      folderId: file.parents?.[0] ?? undefined,
      webUrl: file.webViewLink ?? undefined,
      createdAt: file.createdTime ? new Date(file.createdTime) : undefined,
      modifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : undefined,
    };
  }

  private isNotFoundError(error: unknown): boolean {
    // Check status first as @googleapis/drive sets code to strings like "ENOTFOUND"
    if (error && typeof error === "object" && "status" in error) {
      return (error as { status: number }).status === 404;
    }
    if (error && typeof error === "object" && "code" in error) {
      return (error as { code: number }).code === 404;
    }
    return false;
  }

  /**
   * Escapes a value for use in Google Drive query syntax.
   * Must escape backslashes first, then single quotes.
   */
  private escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  }
}
