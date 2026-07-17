import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";

const OAUTH_STATE_COOKIE =
  "__Secure-better-auth.oauth_state=encrypted-oauth-state";
const REQUEST_FINGERPRINT = createHash("sha256")
  .update("encrypted-oauth-state")
  .digest("hex");

const {
  mockClaimOAuthCode,
  mockClearOAuthCode,
  mockGetOAuthCodeResult,
  mockIsOAuthCodeStoreConfigured,
  mockSetOAuthCodeResult,
} = vi.hoisted(() => ({
  mockClaimOAuthCode: vi.fn(),
  mockClearOAuthCode: vi.fn(),
  mockGetOAuthCodeResult: vi.fn(),
  mockIsOAuthCodeStoreConfigured: vi.fn(),
  mockSetOAuthCodeResult: vi.fn(),
}));

vi.mock("@/utils/redis/oauth-code", () => ({
  claimOAuthCode: mockClaimOAuthCode,
  clearOAuthCode: mockClearOAuthCode,
  getOAuthCodeResult: mockGetOAuthCodeResult,
  isOAuthCodeStoreConfigured: mockIsOAuthCodeStoreConfigured,
  setOAuthCodeResult: mockSetOAuthCodeResult,
}));

import { deduplicateOAuthCallback } from "./auth-callback-deduplication";

const logger = createScopedLogger("test/auth-callback-deduplication");

describe("deduplicateOAuthCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsOAuthCodeStoreConfigured.mockReturnValue(true);
    mockClaimOAuthCode.mockResolvedValue(null);
    mockGetOAuthCodeResult.mockResolvedValue(null);
    mockSetOAuthCodeResult.mockResolvedValue(undefined);
    mockClearOAuthCode.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes non-callback requests directly to Better Auth", async () => {
    const handleRequest = vi
      .fn()
      .mockResolvedValue(Response.json({ providers: ["google"] }));

    const response = await deduplicateOAuthCallback({
      request: new Request(
        "https://example.com/api/auth/sign-in/social?code=not-a-callback",
      ),
      handleRequest,
      logger,
    });

    expect(response.status).toBe(200);
    expect(handleRequest).toHaveBeenCalledOnce();
    expect(mockIsOAuthCodeStoreConfigured).not.toHaveBeenCalled();
    expect(mockClaimOAuthCode).not.toHaveBeenCalled();
  });

  it("does not use Redis when the callback store is not configured", async () => {
    mockIsOAuthCodeStoreConfigured.mockReturnValue(false);
    const response = createSuccessfulCallbackResponse();
    const handleRequest = vi.fn().mockResolvedValue(response);

    await expect(
      deduplicateOAuthCallback({
        request: createGoogleCallbackRequest(),
        handleRequest,
        logger,
      }),
    ).resolves.toBe(response);

    expect(handleRequest).toHaveBeenCalledOnce();
    expect(mockClaimOAuthCode).not.toHaveBeenCalled();
  });

  it("does not use Redis without Better Auth's OAuth state cookie", async () => {
    const response = createSuccessfulCallbackResponse();
    const handleRequest = vi.fn().mockResolvedValue(response);

    await expect(
      deduplicateOAuthCallback({
        request: new Request(
          "https://example.com/api/auth/callback/google?code=oauth-code&state=oauth-state",
        ),
        handleRequest,
        logger,
      }),
    ).resolves.toBe(response);

    expect(handleRequest).toHaveBeenCalledOnce();
    expect(mockClaimOAuthCode).not.toHaveBeenCalled();
  });

  it("caches the first successful callback redirect", async () => {
    const response = createSuccessfulCallbackResponse();
    const handleRequest = vi.fn().mockResolvedValue(response);

    await expect(
      deduplicateOAuthCallback({
        request: createGoogleCallbackRequest(),
        handleRequest,
        logger,
      }),
    ).resolves.toBe(response);

    expect(mockClaimOAuthCode).toHaveBeenCalledWith(
      "oauth-code",
      REQUEST_FINGERPRINT,
    );
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith(
      "oauth-code",
      {
        redirect: "https://example.com/welcome-redirect",
        setCookies: JSON.stringify([
          "better-auth.session_token=session-token; Path=/; HttpOnly; Secure",
        ]),
        status: "302",
      },
      {
        requestFingerprint: REQUEST_FINGERPRINT,
        ttlSeconds: 600,
      },
    );
  });

  it("reuses a cached callback redirect without exchanging the code again", async () => {
    mockClaimOAuthCode.mockResolvedValue({
      params: {
        redirect: "https://example.com/welcome-redirect",
        setCookies: JSON.stringify([
          "better-auth.session_token=session-token; Path=/; HttpOnly; Secure",
        ]),
        status: "302",
      },
      requestFingerprint: REQUEST_FINGERPRINT,
      status: "success",
    });
    const handleRequest = vi.fn();

    const response = await deduplicateOAuthCallback({
      request: createGoogleCallbackRequest(),
      handleRequest,
      logger,
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.com/welcome-redirect",
    );
    expect(response.headers.get("set-cookie")).toBe(
      "better-auth.session_token=session-token; Path=/; HttpOnly; Secure",
    );
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it("does not replay session cookies to a different OAuth state", async () => {
    mockClaimOAuthCode.mockResolvedValue({
      params: {
        redirect: "https://example.com/welcome-redirect",
        setCookies: JSON.stringify([
          "better-auth.session_token=session-token; Path=/; HttpOnly; Secure",
        ]),
        status: "302",
      },
      requestFingerprint: "different-request",
      status: "success",
    });

    const response = await deduplicateOAuthCallback({
      request: createGoogleCallbackRequest(),
      handleRequest: vi.fn(),
      logger,
    });

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("waits for an in-flight callback and reuses its redirect", async () => {
    vi.useFakeTimers();
    mockGetOAuthCodeResult.mockResolvedValueOnce({
      params: {
        redirect: "https://example.com/welcome-redirect",
        status: "302",
      },
      requestFingerprint: REQUEST_FINGERPRINT,
      status: "success",
    });
    mockClaimOAuthCode.mockResolvedValue({
      requestFingerprint: REQUEST_FINGERPRINT,
      status: "processing",
    });
    const handleRequest = vi.fn();

    const responsePromise = deduplicateOAuthCallback({
      request: createGoogleCallbackRequest(),
      handleRequest,
      logger,
    });
    await vi.advanceTimersByTimeAsync(250);
    const response = await responsePromise;

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.com/welcome-redirect",
    );
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it("falls back to Better Auth when the deduplication store is unavailable", async () => {
    mockClaimOAuthCode.mockRejectedValue(new Error("Redis unavailable"));
    const response = createSuccessfulCallbackResponse();
    const handleRequest = vi.fn().mockResolvedValue(response);

    await expect(
      deduplicateOAuthCallback({
        request: createGoogleCallbackRequest(),
        handleRequest,
        logger,
      }),
    ).resolves.toBe(response);

    expect(handleRequest).toHaveBeenCalledOnce();
  });

  it("releases the callback lock when Better Auth throws", async () => {
    const error = new Error("Callback failed");
    const handleRequest = vi.fn().mockRejectedValue(error);

    await expect(
      deduplicateOAuthCallback({
        request: createGoogleCallbackRequest(),
        handleRequest,
        logger,
      }),
    ).rejects.toBe(error);

    expect(mockClearOAuthCode).toHaveBeenCalledWith("oauth-code");
  });
});

function createGoogleCallbackRequest() {
  return new Request(
    "https://example.com/api/auth/callback/google?code=oauth-code&state=oauth-state",
    { headers: { cookie: OAUTH_STATE_COOKIE } },
  );
}

function createSuccessfulCallbackResponse() {
  return new Response(null, {
    headers: [
      ["location", "https://example.com/welcome-redirect"],
      [
        "set-cookie",
        "better-auth.session_token=session-token; Path=/; HttpOnly; Secure",
      ],
    ],
    status: 302,
  });
}
