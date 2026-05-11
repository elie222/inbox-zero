import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFolderPath } from "./folder-utils";
import type { DriveProvider, DriveFolder } from "./types";
import { createTestLogger } from "@/__tests__/helpers";

function createMockFolder(id: string, name: string): DriveFolder {
  return {
    id,
    name,
    path: name,
    webUrl: `https://drive.example.com/${id}`,
  };
}

function createMockProvider(
  existingFolders: Map<string | undefined, DriveFolder[]> = new Map(),
  providerName: DriveProvider["name"] = "google",
): DriveProvider {
  const createdFolders: DriveFolder[] = [];
  let folderId = 1;

  return {
    name: providerName,
    toJSON: () => ({ name: providerName, type: "drive" }),
    getAccessToken: () => "mock-token",
    listFolders: vi.fn(async (parentId?: string) => {
      const existing = existingFolders.get(parentId) || [];
      const created = createdFolders.filter((f) => {
        if (parentId === undefined) return !f.path?.includes("/");
        return f.path?.startsWith(parentId);
      });
      return [...existing, ...created];
    }),
    getFolder: vi.fn(async () => null),
    createFolder: vi.fn(async (name: string, parentId?: string) => {
      const folder = createMockFolder(`folder-${folderId++}`, name);
      createdFolders.push({ ...folder, parentId });
      return folder;
    }),
    uploadFile: vi.fn(async () => ({
      id: "file-1",
      name: "test.pdf",
      mimeType: "application/pdf",
      webUrl: "https://drive.example.com/file-1",
    })),
    getFile: vi.fn(async () => null),
    moveFile: vi.fn(async (fileId: string, targetFolderId: string) => ({
      id: fileId,
      name: "moved-file",
      mimeType: "application/pdf",
      folderId: targetFolderId,
    })),
  };
}

const logger = createTestLogger();

describe("createFolderPath", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create a single folder at root", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(provider, "Receipts", logger);

    expect(result.folder.name).toBe("Receipts");
    expect(result.allFolders).toHaveLength(1);
    expect(result.allFolders[0].path).toBe("Receipts");
    expect(provider.createFolder).toHaveBeenCalledWith("Receipts", undefined);
  });

  it("should create nested folders", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(
      provider,
      "Receipts/2024/December",
      logger,
    );

    expect(result.folder.name).toBe("December");
    expect(result.allFolders).toHaveLength(3);
    expect(result.allFolders[0].path).toBe("Receipts");
    expect(result.allFolders[1].path).toBe("Receipts/2024");
    expect(result.allFolders[2].path).toBe("Receipts/2024/December");
    expect(provider.createFolder).toHaveBeenCalledTimes(3);
    expect(provider.createFolder).toHaveBeenNthCalledWith(
      1,
      "Receipts",
      undefined,
    );
  });

  it("should use existing folder if it exists", async () => {
    const existingFolders = new Map<string | undefined, DriveFolder[]>([
      [undefined, [createMockFolder("existing-1", "Receipts")]],
    ]);
    const provider = createMockProvider(existingFolders);

    const result = await createFolderPath(provider, "Receipts/2024", logger);

    expect(result.folder.name).toBe("2024");
    expect(result.allFolders).toHaveLength(2);
    expect(result.allFolders[0].folder.id).toBe("existing-1");
    expect(result.allFolders[0].path).toBe("Receipts");
    expect(result.allFolders[1].path).toBe("Receipts/2024");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
    expect(provider.createFolder).toHaveBeenCalledWith("2024", "existing-1");
  });

  it("should match folder names case-insensitively", async () => {
    const existingFolders = new Map<string | undefined, DriveFolder[]>([
      [undefined, [createMockFolder("existing-1", "RECEIPTS")]],
    ]);
    const provider = createMockProvider(existingFolders);

    const result = await createFolderPath(provider, "receipts/2024", logger);

    expect(result.folder.name).toBe("2024");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
    expect(provider.createFolder).toHaveBeenCalledWith("2024", "existing-1");
  });

  it("should handle path with leading slash", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(provider, "/Receipts", logger);

    expect(result.folder.name).toBe("Receipts");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
  });

  it("should handle path with trailing slash", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(provider, "Receipts/", logger);

    expect(result.folder.name).toBe("Receipts");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
  });

  it("should throw error for empty path", async () => {
    const provider = createMockProvider();

    await expect(createFolderPath(provider, "", logger)).rejects.toThrow(
      "Failed to create folder path",
    );
  });

  it("should match existing normalized microsoft folders", async () => {
    const existingFolders = new Map<string | undefined, DriveFolder[]>([
      [undefined, [createMockFolder("existing-1", "Plans-2026")]],
    ]);
    const provider = createMockProvider(existingFolders, "microsoft");

    const result = await createFolderPath(provider, "Plans:2026", logger);

    expect(result.folder.id).toBe("existing-1");
    expect(result.folder.name).toBe("Plans-2026");
    expect(result.allFolders[0].path).toBe("Plans-2026");
    expect(provider.createFolder).not.toHaveBeenCalled();
  });
});
