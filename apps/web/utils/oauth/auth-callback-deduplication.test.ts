import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";

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
    mockClaimOAuthCode.mockResolvedValue("acquired");
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
    const response = Response.redirect(
      "https://example.com/welcome-redirect",
      302,
    );
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

  it("caches the first successful callback redirect", async () => {
    const response = Response.redirect(
      "https://example.com/welcome-redirect",
      302,
    );
    const handleRequest = vi.fn().mockResolvedValue(response);

    await expect(
      deduplicateOAuthCallback({
        request: createGoogleCallbackRequest(),
        handleRequest,
        logger,
      }),
    ).resolves.toBe(response);

    expect(mockClaimOAuthCode).toHaveBeenCalledWith("oauth-code");
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith("oauth-code", {
      redirect: "https://example.com/welcome-redirect",
      status: "302",
    });
  });

  it("reuses a cached callback redirect without exchanging the code again", async () => {
    mockClaimOAuthCode.mockResolvedValue({
      params: {
        redirect: "https://example.com/welcome-redirect",
        status: "302",
      },
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
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it("waits for an in-flight callback and reuses its redirect", async () => {
    vi.useFakeTimers();
    mockGetOAuthCodeResult.mockResolvedValueOnce({
      params: {
        redirect: "https://example.com/welcome-redirect",
        status: "302",
      },
      status: "success",
    });
    mockClaimOAuthCode.mockResolvedValue("processing");
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
    const response = Response.redirect(
      "https://example.com/welcome-redirect",
      302,
    );
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
  );
}
