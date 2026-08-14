import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { uploadResumableChunks } from "./upload-session";

vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn(async () => undefined),
}));

describe("uploadResumableChunks", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("uploads chunks until the session returns the created resource", async () => {
    const content = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = parseContentRange(getContentRangeHeader(init));
      if (!range) throw new Error("Expected a chunk upload");

      if (range.endInclusive + 1 === range.totalSize) {
        return createdResourceResponse(201);
      }

      return progressResponse(range.endInclusive + 1, range.totalSize);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await upload(content);

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      await expect(result.response.json()).resolves.toEqual({ id: "item-1" });
    }

    const putCalls = getCallsByMethod(fetchMock, "PUT");
    expect(putCalls.map(([, init]) => getContentRangeHeader(init))).toEqual([
      "bytes 0-3/9",
      "bytes 4-7/9",
      "bytes 8-8/9",
    ]);
    expect(getRequestBody(putCalls[1]?.[1])).toEqual(Buffer.from([4, 5, 6, 7]));
    expect(putCalls[0]?.[1]?.headers).toMatchObject({
      "Content-Type": "application/octet-stream",
      "Content-Length": "4",
    });
  });

  it("accepts a final 200 response containing the created resource", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => createdResourceResponse(200)),
    );

    const result = await upload(Buffer.alloc(4));

    expect(result.kind).toBe("complete");
    if (result.kind === "complete") {
      await expect(result.response.json()).resolves.toEqual({ id: "item-1" });
    }
  });

  it("rejects a final 200 response without a created resource", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response("{}", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(Buffer.alloc(4))).rejects.toMatchObject({
      error: expect.objectContaining({
        message:
          "Upload session returned 200 without nextExpectedRanges or a created item",
      }),
    });
    expect(getCallsByMethod(fetchMock, "DELETE")).toHaveLength(1);
  });

  it("does not treat a 202 response at the total size as completion", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return progressResponse(4, 4);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(Buffer.alloc(4))).rejects.toThrow(
      "upload session ended without returning the created item",
    );
    expect(getCallsByMethod(fetchMock, "DELETE")).toHaveLength(1);
  });

  it("retries a timed-out chunk without advancing its range", async () => {
    const timeoutError = Object.assign(new Error("The operation timed out"), {
      name: "TimeoutError",
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(createdResourceResponse(201));
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(Buffer.alloc(4))).resolves.toMatchObject({
      kind: "complete",
    });
    expect(getContentRangeHeader(fetchMock.mock.calls[0]?.[1])).toBe(
      getContentRangeHeader(fetchMock.mock.calls[1]?.[1]),
    );
  });

  it("resumes from the session status after a 416 response", async () => {
    const content = Buffer.alloc(9);
    let firstChunk = true;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return progressResponse(4, content.length);

      const range = parseContentRange(getContentRangeHeader(init));
      if (!range) throw new Error("Expected a chunk upload");
      if (firstChunk) {
        firstChunk = false;
        return new Response("already received", { status: 416 });
      }
      if (range.endInclusive + 1 === range.totalSize) {
        return createdResourceResponse(201);
      }
      return progressResponse(range.endInclusive + 1, range.totalSize);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(content)).resolves.toMatchObject({ kind: "complete" });

    const putCalls = getCallsByMethod(fetchMock, "PUT");
    expect(getContentRangeHeader(putCalls[1]?.[1])).toBe("bytes 4-7/9");
  });

  it("uses local progress when session status is unavailable", async () => {
    const content = Buffer.alloc(9);
    let firstChunk = true;
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response("not supported", { status: 404 });
      }

      const range = parseContentRange(getContentRangeHeader(init));
      if (!range) throw new Error("Expected a chunk upload");
      if (firstChunk) {
        firstChunk = false;
        return new Response("already received", { status: 416 });
      }
      if (range.endInclusive + 1 === range.totalSize) {
        return createdResourceResponse(201);
      }
      return progressResponse(range.endInclusive + 1, range.totalSize);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(content)).resolves.toMatchObject({ kind: "complete" });

    const putCalls = getCallsByMethod(fetchMock, "PUT");
    expect(getContentRangeHeader(putCalls[1]?.[1])).toBe("bytes 4-7/9");
  });

  it("returns committed when a lost final response is followed by 416", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response("not found", { status: 404 });
      }
      if (fetchMock.mock.calls.length === 1) {
        throw new TypeError("fetch failed");
      }
      return new Response("already received", { status: 416 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(Buffer.alloc(4))).resolves.toEqual({
      kind: "committed",
    });
    expect(getCallsByMethod(fetchMock, "DELETE")).toHaveLength(0);
  });

  it("surfaces unexpected status failures during 416 recovery", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") {
        return new Response("unavailable", { status: 503 });
      }
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return new Response("already received", { status: 416 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(Buffer.alloc(4))).rejects.toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining(
          "Failed to fetch upload session status: 503",
        ),
      }),
    });
    expect(getCallsByMethod(fetchMock, "DELETE")).toHaveLength(1);
  });

  it("cancels when reported progress cannot advance the upload", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "GET") return progressResponse(0, 8);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      return progressResponse(0, 8);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(upload(Buffer.alloc(8))).rejects.toMatchObject({
      error: expect.objectContaining({
        message: expect.stringContaining(
          "Upload session did not make progress",
        ),
      }),
    });
    expect(getCallsByMethod(fetchMock, "PUT")).toHaveLength(1);
    expect(getCallsByMethod(fetchMock, "GET")).toHaveLength(1);
    expect(getCallsByMethod(fetchMock, "DELETE")).toHaveLength(1);
  });
});

function upload(content: Buffer) {
  return uploadResumableChunks({
    uploadUrl: "https://upload.example.test/session",
    content,
    chunkSizeBytes: 4,
    logger: createTestLogger(),
    action: "upload test chunk",
    statusAction: "fetch upload session status",
  });
}

function progressResponse(nextStart: number, totalSize: number) {
  return new Response(
    JSON.stringify({ nextExpectedRanges: [`${nextStart}-${totalSize - 1}`] }),
    {
      status: 202,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function createdResourceResponse(status: 200 | 201) {
  return new Response(JSON.stringify({ id: "item-1" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function getCallsByMethod(fetchMock: ReturnType<typeof vi.fn>, method: string) {
  return fetchMock.mock.calls.filter(([, init]) => init?.method === method);
}

function getContentRangeHeader(init?: RequestInit) {
  const headers = init?.headers as Record<string, string> | undefined;
  return headers?.["Content-Range"];
}

function getRequestBody(init?: RequestInit) {
  return Buffer.from(init?.body as Uint8Array);
}

function parseContentRange(contentRange?: string) {
  const match = contentRange?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  if (!match) return null;

  return {
    start: Number(match[1]),
    endInclusive: Number(match[2]),
    totalSize: Number(match[3]),
  };
}
