import { Client } from "@microsoft/microsoft-graph-client";
import type {
  DriveItem,
  UploadSession,
} from "@microsoft/microsoft-graph-types";
import type { Logger } from "@/utils/logger";
import { createScopedLogger } from "@/utils/logger";
import {
  fetchMicrosoftGraph,
  getMicrosoftGraphClientOptions,
} from "@/utils/microsoft/oauth";
import { isNotFoundError } from "@/utils/outlook/errors";
import { uploadResumableChunks } from "@/utils/microsoft/upload-session";
import type {
  DriveProvider,
  DriveFolder,
  DriveFile,
  UploadFileParams,
} from "@/utils/drive/types";

const MAX_ONEDRIVE_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024 * 1024;
const MAX_SIMPLE_UPLOAD_SIZE_BYTES = 4 * 1024 * 1024;
const ONEDRIVE_UPLOAD_CHUNK_SIZE_BYTES = 5 * 1024 * 1024;

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
      ...getMicrosoftGraphClientOptions(accessToken),
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

      const items = await this.paginateChildren(endpoint, {
        filter: "folder ne null",
        select: "id,name,parentReference,webUrl",
      });

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
        .select(
          "id,name,parentReference,webUrl,folder,specialFolder,package,remoteItem,deleted",
        )
        .get();

      if (item.deleted) {
        this.logger.trace("Folder is deleted", { folderId });
        return null;
      }

      const isFolderLike = !!(
        item.folder ||
        item.specialFolder ||
        item.package ||
        item.remoteItem?.folder ||
        item.remoteItem?.package
      );

      if (!isFolderLike) {
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
      const normalizedName = normalizeOneDriveItemName(name);
      const endpoint = parentId
        ? `/me/drive/items/${parentId}/children`
        : "/me/drive/root/children";

      const item: DriveItem = await this.client.api(endpoint).post({
        name: normalizedName,
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
      if (content.length > MAX_SIMPLE_UPLOAD_SIZE_BYTES) {
        if (content.length > MAX_ONEDRIVE_UPLOAD_SIZE_BYTES) {
          throw new Error(
            `File size ${content.length} exceeds the maximum supported upload size of ${MAX_ONEDRIVE_UPLOAD_SIZE_BYTES} bytes.`,
          );
        }
        return await this.uploadFileViaUploadSession(params);
      }

      // Use the PUT endpoint for simple upload
      // Path: /me/drive/items/{parent-id}:/{filename}:/content
      const normalizedFilename = normalizeOneDriveItemName(filename);
      const item: DriveItem = await this.client
        .api(
          `/me/drive/items/${folderId}:/${encodeURIComponent(normalizedFilename)}:/content`,
        )
        .header("Content-Type", mimeType)
        .put(content);

      return this.convertToFile(item);
    } catch (error) {
      this.logger.error("Error uploading file", { error, filename, folderId });
      throw error;
    }
  }

  private async uploadFileViaUploadSession(
    params: UploadFileParams,
  ): Promise<DriveFile> {
    const { filename, mimeType, content, folderId } = params;
    const normalizedFilename = normalizeOneDriveItemName(filename);
    const newItemPath = `/me/drive/items/${folderId}:/${encodeURIComponent(normalizedFilename)}:/content`;
    // Reserve the conflict-safe name so recovery can use a stable item ID even
    // when Graph renamed the file and the final chunk response was lost.
    const reservedItem: DriveItem = await this.client
      .api(newItemPath)
      .query({ "@microsoft.graph.conflictBehavior": "rename" })
      .header("Content-Type", mimeType)
      .put(Buffer.alloc(0));

    if (!reservedItem.id) {
      throw new Error("Failed to reserve a OneDrive file for upload");
    }

    const itemPath = `/me/drive/items/${reservedItem.id}`;
    try {
      const uploadSession: UploadSession = await this.client
        .api(`${itemPath}/createUploadSession`)
        .post({});

      const uploadUrl = uploadSession.uploadUrl;
      if (!uploadUrl) {
        throw new Error("Failed to create OneDrive upload session");
      }

      const result = await uploadResumableChunks({
        uploadUrl,
        content,
        chunkSizeBytes: ONEDRIVE_UPLOAD_CHUNK_SIZE_BYTES,
        logger: this.logger,
        action: "upload OneDrive file chunk",
        statusAction: "fetch OneDrive upload session status",
      });

      const item: DriveItem =
        result.kind === "complete"
          ? await result.response.json()
          : await this.client.api(itemPath).get();

      if (result.kind === "committed" && item.size !== content.length) {
        throw new Error(
          "OneDrive upload completed without a response, but the uploaded item could not be verified",
        );
      }

      return this.convertToFile(item);
    } catch (error) {
      const item = await this.client
        .api(itemPath)
        .get()
        .catch(() => null);

      if (item?.size === content.length) {
        return this.convertToFile(item);
      }

      if (item?.size === 0) {
        await this.client
          .api(itemPath)
          .delete()
          .catch(() => undefined);
      }

      throw error;
    }
  }

  async getFile(fileId: string): Promise<DriveFile | null> {
    this.logger.trace("Getting file", { fileId });

    try {
      const item: DriveItem = await this.client
        .api(`/me/drive/items/${fileId}`)
        .select(
          "id,name,file,size,parentReference,webUrl,createdDateTime,lastModifiedDateTime",
        )
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

  async listFiles(
    parentId?: string,
    options?: { mimeTypes?: string[] },
  ): Promise<DriveFile[]> {
    this.logger.trace("Listing files", {
      parentId,
      mimeTypes: options?.mimeTypes,
    });

    const endpoint = parentId
      ? `/me/drive/items/${parentId}/children`
      : "/me/drive/root/children";

    const items = await this.paginateChildren(endpoint, {
      select:
        "id,name,file,size,parentReference,webUrl,createdDateTime,lastModifiedDateTime",
    });

    return items
      .filter((item) => !!item.file?.mimeType)
      .filter((item) =>
        options?.mimeTypes?.length
          ? options.mimeTypes.includes(item.file?.mimeType || "")
          : true,
      )
      .map((item) => this.convertToFile(item));
  }

  async downloadFile(
    fileId: string,
  ): Promise<{ content: Buffer; file: DriveFile } | null> {
    const file = await this.getFile(fileId);
    if (!file) return null;

    const response = await fetchMicrosoftGraph(
      `/me/drive/items/${fileId}/content`,
      {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      },
    );

    if (response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`Failed to download drive file: ${response.status}`);
    }

    return {
      file,
      content: Buffer.from(await response.arrayBuffer()),
    };
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
      modifiedAt: item.lastModifiedDateTime
        ? new Date(item.lastModifiedDateTime)
        : undefined,
    };
  }

  private async paginateChildren(
    endpoint: string,
    options: {
      filter?: string;
      select: string;
    },
  ) {
    const items: DriveItem[] = [];
    let nextUrl: string | undefined;

    do {
      const request = nextUrl
        ? this.client.api(nextUrl)
        : this.client.api(endpoint).select(options.select).top(200);

      if (!nextUrl && options.filter) {
        request.filter(options.filter);
      }

      const response = await request.get();
      items.push(...(response.value || []));
      nextUrl = response["@odata.nextLink"] || undefined;
    } while (nextUrl);

    return items;
  }
}

const INVALID_ONEDRIVE_NAME_CHARS = /[\\/:*?"<>|]/g;

function normalizeOneDriveItemName(name: string) {
  const normalizedName = name
    .replace(INVALID_ONEDRIVE_NAME_CHARS, "-")
    .trim()
    .replace(/[. ]+$/g, "");

  return normalizedName || "untitled";
}
