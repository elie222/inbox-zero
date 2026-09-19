import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EMAIL_ACCOUNT_HEADER,
  createOriginMailRequest,
  emailAccountIdFromMailApiPath,
  mailApiHeaders,
} from "./request";

describe("desktop mail API request headers", () => {
  it("reads the account id from a mail API path", () => {
    expect(
      emailAccountIdFromMailApiPath(
        "/api/mail/v1/accounts/acc-1/capabilities?requestId=r1",
      ),
    ).toBe("acc-1");
    expect(
      emailAccountIdFromMailApiPath("/api/mail/v1/accounts/acc%2Fslash/scopes"),
    ).toBe("acc/slash");
    expect(
      emailAccountIdFromMailApiPath("/api/user/email-accounts"),
    ).toBeNull();
  });

  it("sends X-Email-Account-ID when the path names an account", () => {
    expect(
      mailApiHeaders("/api/mail/v1/accounts/acc-1/operations/op-1", true),
    ).toEqual({
      accept: "application/json",
      [EMAIL_ACCOUNT_HEADER]: "acc-1",
      "content-type": "application/json",
    });
    expect(mailApiHeaders("/health", false)).toEqual({
      accept: "application/json",
    });
  });
});

describe("createOriginMailRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a PUT JSON body and session cookies", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createOriginMailRequest({
      origin: "http://localhost:3000",
      cookieHeader: () => "better-auth.session=abc",
    });
    const result = await request({
      method: "PUT",
      path: "/api/mail/v1/accounts/acc-1/operations/op-1",
      body: { protocolVersion: 1, requestId: "r1" },
      signal: new AbortController().signal,
    });
    expect(result).toEqual({ status: 200, json: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "http://localhost:3000/api/mail/v1/accounts/acc-1/operations/op-1",
    );
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(
      JSON.stringify({ protocolVersion: 1, requestId: "r1" }),
    );
    expect(init.headers).toMatchObject({
      accept: "application/json",
      [EMAIL_ACCOUNT_HEADER]: "acc-1",
      "content-type": "application/json",
      cookie: "better-auth.session=abc",
    });
  });

  it("issues mail HTTP against the configured origin, not the SaaS host", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createOriginMailRequest({
      origin: "http://mail.internal.example:8080",
    });
    await request({
      method: "GET",
      path: "/api/mail/v1/accounts/acc-1/capabilities",
      signal: new AbortController().signal,
    });
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      "http://mail.internal.example:8080/api/mail/v1/accounts/acc-1/capabilities",
    );
    expect(url).not.toContain("getinboxzero.com");
  });

  it("returns attachment bytes without parsing them as JSON", async () => {
    const bytes = new Uint8Array([9, 8, 7]);
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
    const request = createOriginMailRequest({
      origin: "http://localhost:3000",
    });
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
        new Response(JSON.stringify({ status: "staged" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const request = createOriginMailRequest({
      origin: "http://localhost:3000",
    });
    await request({
      method: "PUT",
      path: "/api/mail/v1/accounts/acc-1/uploads/file-1/content",
      body: bytes,
      signal: new AbortController().signal,
    });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.body).toBe(bytes);
    expect(init.headers).toMatchObject({
      accept: "application/json",
      "content-type": "application/octet-stream",
      [EMAIL_ACCOUNT_HEADER]: "acc-1",
    });
  });
});
