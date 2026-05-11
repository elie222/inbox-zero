import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@microsoft/microsoft-graph-client";
import { createTestLogger } from "@/__tests__/helpers";
import { OneDriveProvider } from "./microsoft";

vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: vi.fn(),
  },
}));

vi.mock("@/utils/microsoft/oauth", () => ({
  fetchMicrosoftGraph: vi.fn(),
  getMicrosoftGraphClientOptions: vi.fn(() => ({})),
}));

describe("OneDriveProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sanitizes invalid folder names before creating them", async () => {
    const post = vi.fn(async () => ({
      id: "folder-1",
      name: "Plans-2026",
      folder: {},
      parentReference: { id: "parent-1", path: "/drive/root:" },
    }));
    const api = vi.fn(() => ({ post }));

    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await provider.createFolder("Plans:2026", "parent-1");

    expect(api).toHaveBeenCalledWith("/me/drive/items/parent-1/children");
    expect(post).toHaveBeenCalledWith({
      name: "Plans-2026",
      folder: {},
      "@microsoft.graph.conflictBehavior": "rename",
    });
  });

  it("sanitizes invalid file names before uploading them", async () => {
    const content = Buffer.from("pdf-binary");
    const put = vi.fn(async () => ({
      id: "file-1",
      name: "Agenda - Plans 2025-2026.pdf",
      file: { mimeType: "application/pdf" },
      parentReference: { id: "folder-1" },
      size: content.length,
    }));
    const header = vi.fn(() => ({ put }));
    const api = vi.fn(() => ({ header }));

    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await provider.uploadFile({
      filename: "Agenda - Plans 2025:2026.pdf",
      mimeType: "application/pdf",
      content,
      folderId: "folder-1",
    });

    expect(api).toHaveBeenCalledWith(
      "/me/drive/items/folder-1:/Agenda%20-%20Plans%202025-2026.pdf:/content",
    );
    expect(header).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(put).toHaveBeenCalledWith(content);
  });

  it("uses a fallback name when uploading a blank filename", async () => {
    const content = Buffer.from("pdf-binary");
    const put = vi.fn(async () => ({
      id: "file-1",
      name: "untitled",
      file: { mimeType: "application/pdf" },
      parentReference: { id: "folder-1" },
      size: content.length,
    }));
    const header = vi.fn(() => ({ put }));
    const api = vi.fn(() => ({ header }));

    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await provider.uploadFile({
      filename: "   ",
      mimeType: "application/pdf",
      content,
      folderId: "folder-1",
    });

    expect(api).toHaveBeenCalledWith(
      "/me/drive/items/folder-1:/untitled:/content",
    );
    expect(header).toHaveBeenCalledWith("Content-Type", "application/pdf");
    expect(put).toHaveBeenCalledWith(content);
  });
});
