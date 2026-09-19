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
});
