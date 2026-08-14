import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";
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

vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn(async () => undefined),
}));

describe("OneDriveProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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

  it("uses simple upload for files up to 4MB without creating a session", async () => {
    const content = Buffer.alloc(4 * 1024 * 1024);
    const put = vi.fn(async () => ({
      id: "file-1",
      name: "exact-4mb.pdf",
      file: { mimeType: "application/pdf" },
      parentReference: { id: "folder-1" },
    }));
    const header = vi.fn(() => ({ put }));
    const api = vi.fn((path: string) => {
      if (path.endsWith("/createUploadSession")) {
        throw new Error("Should not create an upload session for 4MB files");
      }
      return { header };
    });

    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await provider.uploadFile({
      filename: "exact-4mb.pdf",
      mimeType: "application/pdf",
      content,
      folderId: "folder-1",
    });

    expect(api).toHaveBeenCalledWith(
      "/me/drive/items/folder-1:/exact-4mb.pdf:/content",
    );
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0]?.[0]).toHaveLength(4 * 1024 * 1024);
  });

  it("uploads files larger than 4MB via an upload session in chunks", async () => {
    const totalSize = 2 * ONEDRIVE_CHUNK_SIZE + 1;
    const content = Buffer.alloc(totalSize);
    const createUploadSessionPost = vi.fn(async () => ({
      uploadUrl: "https://upload.example.test/session",
    }));
    const fetchMock = createProgressingFetchMock(totalSize);
    vi.stubGlobal("fetch", fetchMock);

    const { api, reserveItemPut, reserveItemQuery } = createLargeUploadApi({
      createUploadSessionPost,
    });
    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    const file = await provider.uploadFile({
      filename: "big-file.pdf",
      mimeType: "application/pdf",
      content,
      folderId: "folder-1",
    });

    expect(api).toHaveBeenCalledWith(
      "/me/drive/items/file-1/createUploadSession",
    );
    expect(reserveItemQuery).toHaveBeenCalledWith({
      "@microsoft.graph.conflictBehavior": "rename",
    });
    expect(reserveItemPut).toHaveBeenCalledWith(Buffer.alloc(0));
    expect(createUploadSessionPost).toHaveBeenCalledWith({});

    const putCalls = fetchMock.mock.calls.filter(
      ([, init]) => init?.method === "PUT",
    );
    expect(putCalls).toHaveLength(3);
    expect(getContentRangeHeader(putCalls[0]?.[1])).toBe(
      `bytes 0-${ONEDRIVE_CHUNK_SIZE - 1}/${totalSize}`,
    );
    expect(getContentRangeHeader(putCalls[1]?.[1])).toBe(
      `bytes ${ONEDRIVE_CHUNK_SIZE}-${ONEDRIVE_CHUNK_SIZE * 2 - 1}/${totalSize}`,
    );
    expect(getContentRangeHeader(putCalls[2]?.[1])).toBe(
      `bytes ${ONEDRIVE_CHUNK_SIZE * 2}-${totalSize - 1}/${totalSize}`,
    );

    expect(file).toMatchObject({
      id: "file-1",
      name: "big-file.pdf",
      mimeType: "application/pdf",
      size: totalSize,
      folderId: "folder-1",
    });
  });

  it("recovers the uploaded item when the final chunk response is lost", async () => {
    const totalSize = ONEDRIVE_CHUNK_SIZE + 1;
    const content = Buffer.alloc(totalSize);
    const createUploadSessionPost = vi.fn(async () => ({
      uploadUrl: "https://upload.example.test/session",
    }));
    const recoveredItem = {
      id: "file-1",
      name: "big-file 1.pdf",
      file: { mimeType: "application/pdf" },
      size: totalSize,
      parentReference: { id: "folder-1" },
    };
    const get = vi.fn(async () => recoveredItem);
    let finalChunkAttempts = 0;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response("not found", { status: 404 });
      }

      const parsedRange = parseContentRange(getContentRangeHeader(init));
      if (!parsedRange) {
        throw new Error(
          `Unexpected content range: ${getContentRangeHeader(init)}`,
        );
      }

      if (parsedRange.endInclusive + 1 >= parsedRange.totalSize) {
        finalChunkAttempts += 1;
        if (finalChunkAttempts === 1) {
          throw new TypeError("fetch failed");
        }
        return new Response("already received", { status: 416 });
      }

      return new Response(
        JSON.stringify({
          nextExpectedRanges: [
            `${parsedRange.endInclusive + 1}-${parsedRange.totalSize - 1}`,
          ],
        }),
        {
          status: 202,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { api, reserveItemPut, reserveItemQuery } = createLargeUploadApi({
      createUploadSessionPost,
      get,
      reservedItem: {
        id: "file-1",
        name: "big-file 1.pdf",
        file: { mimeType: "application/pdf" },
        size: 0,
        parentReference: { id: "folder-1" },
      },
    });
    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    const file = await provider.uploadFile({
      filename: "big-file.pdf",
      mimeType: "application/pdf",
      content,
      folderId: "folder-1",
    });

    expect(file).toMatchObject({
      id: "file-1",
      name: "big-file 1.pdf",
      size: totalSize,
    });
    expect(reserveItemQuery).toHaveBeenCalledWith({
      "@microsoft.graph.conflictBehavior": "rename",
    });
    expect(reserveItemPut).toHaveBeenCalledWith(Buffer.alloc(0));
    expect(api).toHaveBeenCalledWith("/me/drive/items/file-1");
    expect(get).toHaveBeenCalledTimes(1);
    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(0);
  });

  it("cancels the upload session when a chunk upload fails", async () => {
    const totalSize = ONEDRIVE_CHUNK_SIZE + 1;
    const content = Buffer.alloc(totalSize);
    const createUploadSessionPost = vi.fn(async () => ({
      uploadUrl: "https://upload.example.test/session",
    }));
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { api, deleteItem } = createLargeUploadApi({
      createUploadSessionPost,
    });
    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await expect(
      provider.uploadFile({
        filename: "big-file.pdf",
        mimeType: "application/pdf",
        content,
        folderId: "folder-1",
      }),
    ).rejects.toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining(
          "Failed to upload OneDrive file chunk: 500",
        ),
      }),
    });

    expect(
      fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE"),
    ).toHaveLength(1);
    expect(deleteItem).toHaveBeenCalledTimes(1);
  });

  it("rejects files above the maximum upload size before creating a session", async () => {
    const createUploadSessionPost = vi.fn();
    const api = vi.fn(() => ({ post: createUploadSessionPost }));
    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await expect(
      provider.uploadFile({
        filename: "huge-file.pdf",
        mimeType: "application/pdf",
        content: {
          length: MAX_ONEDRIVE_UPLOAD_SIZE_BYTES + 1,
        } as unknown as Buffer,
        folderId: "folder-1",
      }),
    ).rejects.toThrow("exceeds the maximum supported upload size");

    expect(api).not.toHaveBeenCalled();
  });

  it("throws when the upload session has no upload URL", async () => {
    const createUploadSessionPost = vi.fn(async () => ({}));
    const { api, deleteItem } = createLargeUploadApi({
      createUploadSessionPost,
    });
    vi.mocked(Client.init).mockReturnValue({ api } as any);

    const provider = new OneDriveProvider("token", createTestLogger());

    await expect(
      provider.uploadFile({
        filename: "big-file.pdf",
        mimeType: "application/pdf",
        content: Buffer.alloc(4 * 1024 * 1024 + 1),
        folderId: "folder-1",
      }),
    ).rejects.toThrow("Failed to create OneDrive upload session");

    expect(deleteItem).toHaveBeenCalledTimes(1);
  });
});

const ONEDRIVE_CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_ONEDRIVE_UPLOAD_SIZE_BYTES = 250 * 1024 * 1024 * 1024;

function createLargeUploadApi({
  createUploadSessionPost,
  get,
  reservedItem = {
    id: "file-1",
    name: "big-file.pdf",
    file: { mimeType: "application/pdf" },
    size: 0,
    parentReference: { id: "folder-1" },
  },
}: {
  createUploadSessionPost: Mock;
  get?: Mock;
  reservedItem?: {
    id: string;
    name: string;
    file: { mimeType: string };
    size: number;
    parentReference: { id: string };
  };
}) {
  const reserveItemPut = vi.fn(async () => reservedItem);
  const reserveItemHeader = vi.fn(() => ({ put: reserveItemPut }));
  const reserveItemQuery = vi.fn(() => ({ header: reserveItemHeader }));
  const getItem = get ?? vi.fn(async () => reservedItem);
  const deleteItem = vi.fn(async () => undefined);
  const api = vi.fn((path: string) => {
    if (path === "/me/drive/items/folder-1:/big-file.pdf:/content") {
      return { query: reserveItemQuery };
    }
    if (path === `/me/drive/items/${reservedItem.id}/createUploadSession`) {
      return { post: createUploadSessionPost };
    }
    if (path === `/me/drive/items/${reservedItem.id}`) {
      return { delete: deleteItem, get: getItem };
    }
    throw new Error(`Unexpected API path: ${path}`);
  });

  return { api, deleteItem, reserveItemPut, reserveItemQuery };
}

function createProgressingFetchMock(
  totalSize: number,
  finalStatus: 200 | 201 = 201,
) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "GET") {
      throw new Error("Unexpected GET in progressing fetch mock");
    }

    const parsedRange = parseContentRange(getContentRangeHeader(init));
    if (!parsedRange) {
      throw new Error(
        `Unexpected content range: ${getContentRangeHeader(init)}`,
      );
    }

    if (parsedRange.endInclusive + 1 >= parsedRange.totalSize) {
      return createFinalItemResponse(totalSize, finalStatus);
    }

    return new Response(
      JSON.stringify({
        nextExpectedRanges: [
          `${parsedRange.endInclusive + 1}-${parsedRange.totalSize - 1}`,
        ],
      }),
      {
        status: 202,
        headers: { "Content-Type": "application/json" },
      },
    );
  });
}

function createFinalItemResponse(totalSize: number, status = 201) {
  return new Response(
    JSON.stringify({
      id: "file-1",
      name: "big-file.pdf",
      file: { mimeType: "application/pdf" },
      size: totalSize,
      parentReference: { id: "folder-1" },
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function getContentRangeHeader(init?: RequestInit) {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["Content-Range"] || "";
}

function parseContentRange(contentRange: string) {
  const match = /bytes (\d+)-(\d+)\/(\d+)/.exec(contentRange);
  if (!match) return null;

  return {
    start: Number(match[1]),
    endInclusive: Number(match[2]),
    totalSize: Number(match[3]),
  };
}
