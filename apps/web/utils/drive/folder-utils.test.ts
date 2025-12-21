import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFolderPath } from "./folder-utils";
import type { DriveProvider, DriveFolder } from "./types";
import type { Logger } from "@/utils/logger";

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
): DriveProvider {
  const createdFolders: DriveFolder[] = [];
  let folderId = 1;

  return {
    name: "google",
    toJSON: () => ({ name: "google", type: "drive" }),
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
  };
}

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    with: vi.fn(() => createMockLogger()),
  } as unknown as Logger;
}

describe("createFolderPath", () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  it("should create a single folder at root", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(provider, "Receipts", mockLogger);

    expect(result.name).toBe("Receipts");
    expect(provider.createFolder).toHaveBeenCalledWith("Receipts", undefined);
  });

  it("should create nested folders", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(
      provider,
      "Receipts/2024/December",
      mockLogger,
    );

    expect(result.name).toBe("December");
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

    const result = await createFolderPath(
      provider,
      "Receipts/2024",
      mockLogger,
    );

    expect(result.name).toBe("2024");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
    expect(provider.createFolder).toHaveBeenCalledWith("2024", "existing-1");
  });

  it("should match folder names case-insensitively", async () => {
    const existingFolders = new Map<string | undefined, DriveFolder[]>([
      [undefined, [createMockFolder("existing-1", "RECEIPTS")]],
    ]);
    const provider = createMockProvider(existingFolders);

    const result = await createFolderPath(
      provider,
      "receipts/2024",
      mockLogger,
    );

    expect(result.name).toBe("2024");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
    expect(provider.createFolder).toHaveBeenCalledWith("2024", "existing-1");
  });

  it("should handle path with leading slash", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(provider, "/Receipts", mockLogger);

    expect(result.name).toBe("Receipts");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
  });

  it("should handle path with trailing slash", async () => {
    const provider = createMockProvider();

    const result = await createFolderPath(provider, "Receipts/", mockLogger);

    expect(result.name).toBe("Receipts");
    expect(provider.createFolder).toHaveBeenCalledTimes(1);
  });

  it("should throw error for empty path", async () => {
    const provider = createMockProvider();

    await expect(createFolderPath(provider, "", mockLogger)).rejects.toThrow(
      "Failed to create folder path",
    );
  });

  it("should log when creating folders", async () => {
    const provider = createMockProvider();

    await createFolderPath(provider, "Receipts/2024", mockLogger);

    expect(mockLogger.info).toHaveBeenCalledWith("Creating folder", {
      name: "Receipts",
      parentId: undefined,
    });
  });
});
