import { afterEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { createMailHttpRequest } from "./http";

describe("createMailHttpRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns attachment bytes without parsing them as JSON", async () => {
    const bytes = new Uint8Array([4, 5, 6]);
    const fetchMock = vi.fn(
      async () =>
        new Response(bytes, {
          status: 200,
          headers: {
            "content-type": "application/octet-stream",
            "content-length": "3",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createMailHttpRequest("acc-1");
    const result = await request({
      method: "GET",
      path: "/api/mail/v1/accounts/acc-1/attachment-content?messageId=m1&attachmentId=a1",
      signal: new AbortController().signal,
      accept: "bytes",
    });
    expect(result.status).toBe(200);
    expect(result.json).toBeNull();
    expect(result.sizeBytes).toBe(3);
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.bytes ?? []) chunks.push(chunk);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({
      accept: "application/octet-stream",
      [EMAIL_ACCOUNT_HEADER]: "acc-1",
    });
  });

  it("sends upload content as octet-stream bytes, not JSON", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: "staged", blobId: "file-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createMailHttpRequest("acc-1");
    const result = await request({
      method: "PUT",
      path: "/api/mail/v1/accounts/acc-1/uploads/file-1/content",
      body: bytes,
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      status: 200,
      json: { status: "staged", blobId: "file-1" },
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(bytes);
    expect(init.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/octet-stream",
    });
  });
});
