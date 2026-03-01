import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import { OneDriveProvider } from "./microsoft";

vi.mock("server-only", () => ({}));

const { mockApiResponse, mockClient, mockClientInit } = vi.hoisted(() => ({
  mockApiResponse: {
    filter: vi.fn(),
    select: vi.fn(),
    top: vi.fn(),
    header: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
  mockClient: {
    api: vi.fn(),
  },
  mockClientInit: vi.fn(),
}));

vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: mockClientInit,
  },
}));

const logger = createScopedLogger("onedrive-provider-test");

describe("OneDriveProvider.getFolder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiResponse.filter.mockReturnThis();
    mockApiResponse.select.mockReturnThis();
    mockApiResponse.top.mockReturnThis();
    mockApiResponse.header.mockReturnThis();
    mockClient.api.mockReturnValue(mockApiResponse);
    mockClientInit.mockReturnValue(mockClient);
  });

  it("requests folder metadata and returns a folder for valid folders", async () => {
    mockApiResponse.get.mockResolvedValue({
      id: "folder-1",
      name: "Invoices",
      folder: { childCount: 3 },
      parentReference: { id: "parent-1", path: "/drive/root:" },
      webUrl: "https://onedrive.test/folder-1",
    });

    const provider = new OneDriveProvider("token", logger);
    const folder = await provider.getFolder("folder-1");

    expect(mockClient.api).toHaveBeenCalledWith("/me/drive/items/folder-1");
    expect(mockApiResponse.select).toHaveBeenCalledWith(
      "id,name,parentReference,webUrl,folder,specialFolder,package,remoteItem,deleted",
    );
    expect(folder).toMatchObject({
      id: "folder-1",
      name: "Invoices",
      parentId: "parent-1",
      path: "/drive/root:/Invoices",
      webUrl: "https://onedrive.test/folder-1",
    });
  });

  it("returns null for deleted items", async () => {
    mockApiResponse.get.mockResolvedValue({
      id: "folder-1",
      name: "Archived",
      folder: { childCount: 0 },
      deleted: { state: "deleted" },
    });

    const provider = new OneDriveProvider("token", logger);
    const folder = await provider.getFolder("folder-1");

    expect(folder).toBeNull();
  });

  it("returns a folder when only special folder metadata is present", async () => {
    mockApiResponse.get.mockResolvedValue({
      id: "folder-1",
      name: "Personal Vault",
      specialFolder: { name: "vault" },
      parentReference: { id: "parent-1", path: "/drive/root:" },
      webUrl: "https://onedrive.test/folder-1",
    });

    const provider = new OneDriveProvider("token", logger);
    const folder = await provider.getFolder("folder-1");

    expect(folder).toMatchObject({
      id: "folder-1",
      name: "Personal Vault",
      parentId: "parent-1",
      path: "/drive/root:/Personal Vault",
      webUrl: "https://onedrive.test/folder-1",
    });
  });

  it("returns a folder when metadata is present only on remoteItem.folder", async () => {
    mockApiResponse.get.mockResolvedValue({
      id: "folder-1",
      name: "Personal Vault",
      parentReference: { id: "parent-1", path: "/drive/root:" },
      webUrl: "https://onedrive.test/folder-1",
      remoteItem: {
        folder: { childCount: 0 },
      },
    });

    const provider = new OneDriveProvider("token", logger);
    const folder = await provider.getFolder("folder-1");

    expect(folder).toMatchObject({
      id: "folder-1",
      name: "Personal Vault",
      parentId: "parent-1",
      path: "/drive/root:/Personal Vault",
      webUrl: "https://onedrive.test/folder-1",
    });
  });

  it("returns null when the item is not a folder", async () => {
    mockApiResponse.get.mockResolvedValue({
      id: "file-1",
      name: "statement.pdf",
    });

    const provider = new OneDriveProvider("token", logger);
    const folder = await provider.getFolder("file-1");

    expect(folder).toBeNull();
  });

  it("returns null when folder is not found", async () => {
    mockApiResponse.get.mockRejectedValue({
      statusCode: 404,
      error: { code: "itemNotFound" },
    });

    const provider = new OneDriveProvider("token", logger);
    const folder = await provider.getFolder("missing-folder");

    expect(folder).toBeNull();
  });
});
