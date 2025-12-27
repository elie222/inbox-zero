import { Client } from "@microsoft/microsoft-graph-client";
import type { DriveItem } from "@microsoft/microsoft-graph-types";
import type { Logger } from "@/utils/logger";
import { createScopedLogger } from "@/utils/logger";
import { isNotFoundError } from "@/utils/outlook/errors";
import type {
  DriveProvider,
  DriveFolder,
  DriveFile,
  UploadFileParams,
} from "@/utils/drive/types";

/**
 * OneDrive/SharePoint provider using Microsoft Graph API
 * Implements DriveProvider interface for consistent abstraction
 */
export class OneDriveProvider implements DriveProvider {
  readonly name = "microsoft" as const;
  private readonly client: Client;
  private readonly accessToken: string;
  private readonly logger: Logger;

  constructor(accessToken: string, logger?: Logger) {
    this.accessToken = accessToken;
    this.logger = (logger || createScopedLogger("onedrive-provider")).with({
      provider: "microsoft",
    });

    this.client = Client.init({
      authProvider: (done) => {
        done(null, this.accessToken);
      },
      defaultVersion: "v1.0",
    });
  }

  toJSON() {
    return { name: this.name, type: "OneDriveProvider" };
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
      const endpoint = parentId
        ? `/me/drive/items/${parentId}/children`
        : "/me/drive/root/children";

      const response = await this.client
        .api(endpoint)
        .filter("folder ne null") // Only get folders, not files
        .select("id,name,parentReference,webUrl")
        .top(200) // Increase limit for better visibility
        .get();

      const items: DriveItem[] = response.value || [];

      return items.map((item) => this.convertToFolder(item));
    } catch (error) {
      this.logger.error("Error listing folders", { error, parentId });
      throw error;
    }
  }

  async getFolder(folderId: string): Promise<DriveFolder | null> {
    this.logger.trace("Getting folder", { folderId });

    try {
      const item: DriveItem = await this.client
        .api(`/me/drive/items/${folderId}`)
        .select("id,name,parentReference,webUrl")
        .get();

      if (!item.folder) {
        this.logger.warn("Item is not a folder", { folderId });
        return null;
      }

      return this.convertToFolder(item);
    } catch (error) {
      // Handle not found
      if (isNotFoundError(error)) {
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
      const endpoint = parentId
        ? `/me/drive/items/${parentId}/children`
        : "/me/drive/root/children";

      const item: DriveItem = await this.client.api(endpoint).post({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "rename", // Rename if exists
      });

      return this.convertToFolder(item);
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
      // For files up to 4MB, use simple upload
      // For larger files, would need to use upload session (not implemented yet)
      const MAX_SIMPLE_UPLOAD_SIZE = 4 * 1024 * 1024; // 4MB

      if (content.length > MAX_SIMPLE_UPLOAD_SIZE) {
        // TODO: Implement resumable upload for large files
        this.logger.warn("File exceeds simple upload limit", {
          filename,
          size: content.length,
          limit: MAX_SIMPLE_UPLOAD_SIZE,
        });
        throw new Error(
          `File size ${content.length} exceeds 4MB limit. Large file upload not yet implemented.`,
        );
      }

      // Use the PUT endpoint for simple upload
      // Path: /me/drive/items/{parent-id}:/{filename}:/content
      const item: DriveItem = await this.client
        .api(
          `/me/drive/items/${folderId}:/${encodeURIComponent(filename)}:/content`,
        )
        .header("Content-Type", mimeType)
        .put(content);

      return this.convertToFile(item);
    } catch (error) {
      this.logger.error("Error uploading file", { error, filename, folderId });
      throw error;
    }
  }

  async getFile(fileId: string): Promise<DriveFile | null> {
    this.logger.trace("Getting file", { fileId });

    try {
      const item: DriveItem = await this.client
        .api(`/me/drive/items/${fileId}`)
        .select("id,name,file,size,parentReference,webUrl,createdDateTime")
        .get();

      if (!item.file) {
        this.logger.warn("Item is not a file", { fileId });
        return null;
      }

      return this.convertToFile(item);
    } catch (error) {
      if (isNotFoundError(error)) {
        this.logger.trace("File not found", { fileId });
        return null;
      }
      this.logger.error("Error getting file", { error, fileId });
      throw error;
    }
  }

  async moveFile(fileId: string, targetFolderId: string): Promise<DriveFile> {
    this.logger.info("Moving file", { fileId, targetFolderId });

    try {
      const item: DriveItem = await this.client
        .api(`/me/drive/items/${fileId}`)
        .patch({ parentReference: { id: targetFolderId } });

      this.logger.info("File moved", { fileId, targetFolderId });
      return this.convertToFile(item);
    } catch (error) {
      this.logger.error("Error moving file", { error, fileId, targetFolderId });
      throw error;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private convertToFolder(item: DriveItem): DriveFolder {
    if (!item.id) {
      throw new Error("Drive item is missing `id`");
    }
    const name = item.name || "Untitled";
    return {
      id: item.id ?? "",
      name,
      parentId: item.parentReference?.id ?? undefined,
      path: item.parentReference?.path
        ? `${item.parentReference.path}/${name}`
        : undefined,
      webUrl: item.webUrl ?? undefined,
    };
  }

  private convertToFile(item: DriveItem): DriveFile {
    if (!item.id) {
      throw new Error("Drive item is missing `id`");
    }
    return {
      id: item.id,
      name: item.name || "Untitled",
      mimeType: item.file?.mimeType ?? "application/octet-stream",
      size: item.size ?? undefined,
      folderId: item.parentReference?.id ?? undefined,
      webUrl: item.webUrl ?? undefined,
      createdAt: item.createdDateTime
        ? new Date(item.createdDateTime)
        : undefined,
    };
  }
}
