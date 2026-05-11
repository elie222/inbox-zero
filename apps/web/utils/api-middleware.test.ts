import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { SafeError } from "@/utils/error";
import { withAccountApiKey, withStatsApiKey } from "./api-middleware";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_EXTERNAL_API_ENABLED: true },
}));
vi.mock("@/utils/api-auth", () => ({
  validateAccountApiKey: vi.fn(),
  validateApiKeyAndGetEmailProvider: vi.fn(),
}));
vi.mock("@/utils/error.server");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(),
}));
vi.mock("@/utils/redis/account-validation");
vi.mock("@/utils/prisma");
vi.mock("@/utils/admin", () => ({
  isAdmin: vi.fn(),
}));
vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));
vi.mock("@/utils/email/rate-limit", () => ({
  recordRateLimitFromApiError: vi.fn(),
}));
vi.mock("@/utils/email/rate-limit-mode-error", () => ({
  isProviderRateLimitModeError: vi.fn(),
}));
vi.mock("@/utils/error", async (importActual) => {
  const actual = await importActual<typeof import("@/utils/error")>();
  return {
    ...actual,
    captureException: vi.fn(),
    checkCommonErrors: vi.fn(),
  };
});

import {
  validateAccountApiKey,
  validateApiKeyAndGetEmailProvider,
} from "@/utils/api-auth";

const mockValidateAccountApiKey = vi.mocked(validateAccountApiKey);
const mockValidateApiKeyAndGetEmailProvider = vi.mocked(
  validateApiKeyAndGetEmailProvider,
);

function createMockRequest(
  method = "GET",
  url = "http://localhost/api/v1/rules",
): NextRequest {
  const request = new NextRequest(url, {
    method,
    headers: new Headers(),
  });
  request.clone = vi.fn(() => request) as any;

  return request;
}

describe("api-middleware", () => {
  const mockContext = { params: Promise.resolve({}) };

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("logs completed account-scoped API requests with auth context", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = createMockRequest();

    mockValidateAccountApiKey.mockResolvedValue({
      apiKeyId: "key-123",
      userId: "user-123",
      emailAccountId: "email-account-123",
      email: "user@example.com",
      provider: "google",
      accountId: "account-123",
      scopes: ["RULES_READ"],
    });

    const handler = vi.fn(async (apiRequest: any) => {
      expect(apiRequest.apiAuth).toEqual({
        apiKeyId: "key-123",
        userId: "user-123",
        emailAccountId: "email-account-123",
        email: "user@example.com",
        provider: "google",
        accountId: "account-123",
        scopes: ["RULES_READ"],
        authType: "account-scoped",
      });

      return NextResponse.json({ ok: true });
    });

    const wrappedHandler = withAccountApiKey(
      "v1/rules",
      ["RULES_READ"],
      handler,
    );

    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(
      logSpy.mock.calls.map((call) => call.join(" ")).join("\n"),
    ).toContain("External API request completed");
    expect(
      logSpy.mock.calls.map((call) => call.join(" ")).join("\n"),
    ).toContain('"apiKeyId": "key-123"');
  });

  it("logs failed account-scoped API authentication", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const request = createMockRequest();
    mockValidateAccountApiKey.mockRejectedValue(
      new SafeError("Invalid API key", 401),
    );

    const handler = vi.fn();
    const wrappedHandler = withAccountApiKey(
      "v1/rules",
      ["RULES_READ"],
      handler,
    );

    const response = await wrappedHandler(request, mockContext);
    const responseBody = await response.json();

    expect(response.status).toBe(401);
    expect(responseBody).toEqual({
      error: "Invalid API key",
      isKnownError: true,
    });
    expect(handler).not.toHaveBeenCalled();
    expect(
      warnSpy.mock.calls.map((call) => call.join(" ")).join("\n"),
    ).toContain("External API request failed");
  });

  it("attaches account-scoped stats auth and provider to stats requests", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const request = createMockRequest(
      "GET",
      "http://localhost/api/v1/stats/response-time",
    );

    mockValidateApiKeyAndGetEmailProvider.mockResolvedValue({
      apiKeyId: "key-123",
      emailProvider: "provider" as any,
      userId: "user-123",
      accountId: "account-123",
      emailAccountId: "email-account-123",
      provider: "google",
      scopes: ["STATS_READ"],
      authType: "account-scoped",
    });

    const handler = vi.fn(async (apiRequest: any) => {
      expect(apiRequest.apiAuth).toEqual({
        apiKeyId: "key-123",
        userId: "user-123",
        accountId: "account-123",
        emailAccountId: "email-account-123",
        provider: "google",
        scopes: ["STATS_READ"],
        authType: "account-scoped",
      });
      expect(apiRequest.emailProvider).toBe("provider");

      return NextResponse.json({ ok: true });
    });

    const wrappedHandler = withStatsApiKey("v1/stats/response-time", handler);

    const response = await wrappedHandler(request, mockContext);

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(
      logSpy.mock.calls.map((call) => call.join(" ")).join("\n"),
    ).toContain('"apiAuthType": "account-scoped"');
  });
});
