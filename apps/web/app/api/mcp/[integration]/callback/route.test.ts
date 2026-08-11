import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  mockClaimOAuthCodeAndWait,
  mockClearOAuthCode,
  mockHandleOAuthCallback,
  mockIsOAuthCodeStoreConfigured,
  mockSetOAuthCodeResult,
  mockSyncMcpTools,
  mockFindIntegration,
} = vi.hoisted(() => ({
  mockClaimOAuthCodeAndWait: vi.fn(),
  mockClearOAuthCode: vi.fn(),
  mockHandleOAuthCallback: vi.fn(),
  mockIsOAuthCodeStoreConfigured: vi.fn(),
  mockSetOAuthCodeResult: vi.fn(),
  mockSyncMcpTools: vi.fn(),
  mockFindIntegration: vi.fn(() => ({ authType: "oauth" })),
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/mcp/integrations", () => ({
  findIntegration: mockFindIntegration,
}));

vi.mock("@/utils/mcp/oauth", () => ({
  handleOAuthCallback: mockHandleOAuthCallback,
}));

vi.mock("@/utils/mcp/sync-tools", () => ({
  syncMcpTools: mockSyncMcpTools,
}));

vi.mock("@/utils/redis/oauth-code", () => ({
  claimOAuthCodeAndWait: mockClaimOAuthCodeAndWait,
  clearOAuthCode: mockClearOAuthCode,
  isOAuthCodeStoreConfigured: mockIsOAuthCodeStoreConfigured,
  setOAuthCodeResult: mockSetOAuthCodeResult,
}));

import {
  generateSignedOAuthState,
  getMcpPkceCookieName,
  getMcpStateCookieName,
} from "@/utils/oauth/state";
import { GET } from "./route";

describe("mcp callback route", () => {
  const integration = "notion";
  const params = { params: Promise.resolve({ integration }) };

  const createRequest = ({
    code = "valid-auth-code",
    queryState,
    cookieState,
    codeVerifier = "pkce-verifier",
  }: {
    code?: string;
    queryState: string;
    cookieState: string;
    codeVerifier?: string;
  }) =>
    new NextRequest(
      `http://localhost:3000/api/mcp/${integration}/callback?code=${code}&state=${encodeURIComponent(queryState)}`,
      {
        headers: {
          cookie: `${getMcpStateCookieName(integration)}=${cookieState}; ${getMcpPkceCookieName(integration)}=${codeVerifier}`,
        },
      },
    );

  beforeEach(() => {
    vi.clearAllMocks();
    mockFindIntegration.mockReturnValue({ authType: "oauth" });
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "email-account-123",
    } as Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>);
    mockHandleOAuthCallback.mockResolvedValue(undefined);
    mockIsOAuthCodeStoreConfigured.mockReturnValue(true);
    mockSyncMcpTools.mockResolvedValue({ toolsCount: 1 });
    mockClaimOAuthCodeAndWait.mockResolvedValue({ status: "claimed" });
    mockClearOAuthCode.mockResolvedValue(undefined);
    mockSetOAuthCodeResult.mockResolvedValue(undefined);
  });

  it("rejects malformed unsigned state payloads", async () => {
    const unsignedState = Buffer.from(
      JSON.stringify({
        userId: "user-123",
        emailAccountId: "email-account-123",
        type: "notion-mcp",
        nonce: "12345678",
      }),
    ).toString("base64url");

    const response = await GET(
      createRequest({
        queryState: unsignedState,
        cookieState: unsignedState,
      }),
      params,
    );

    const location = response.headers.get("location");
    expect(location).toContain("/integrations");
    expect(location).toContain("error=invalid_state_format");
    expect(mockHandleOAuthCallback).not.toHaveBeenCalled();
  });

  it("rejects a signed callback state that does not match the browser state cookie", async () => {
    const attackerState = generateSignedOAuthState({
      userId: "attacker-user",
      emailAccountId: "attacker-email-account",
      type: "notion-mcp",
    });
    const victimState = generateSignedOAuthState({
      userId: "victim-user",
      emailAccountId: "victim-email-account",
      type: "notion-mcp",
    });

    const response = await GET(
      createRequest({
        queryState: attackerState,
        cookieState: victimState,
      }),
      params,
    );

    const location = response.headers.get("location");
    expect(location).toContain("/integrations");
    expect(location).toContain("error=invalid_state");
    expect(prisma.emailAccount.findFirst).not.toHaveBeenCalled();
    expect(mockHandleOAuthCallback).not.toHaveBeenCalled();
    expect(mockSyncMcpTools).not.toHaveBeenCalled();
  });

  it("accepts a matching signed state and continues the OAuth flow", async () => {
    const state = generateSignedOAuthState({
      userId: "user-123",
      emailAccountId: "email-account-123",
      type: "notion-mcp",
    });

    const response = await GET(
      createRequest({
        queryState: state,
        cookieState: state,
      }),
      params,
    );

    const location = response.headers.get("location");
    expect(location).toContain("/email-account-123/integrations");
    expect(location).toContain("connected=notion");
    expect(mockHandleOAuthCallback).toHaveBeenCalledWith({
      integration: "notion",
      code: "valid-auth-code",
      codeVerifier: "pkce-verifier",
      redirectUri: "http://localhost:3000/api/mcp/notion/callback",
      emailAccountId: "email-account-123",
    });
    expect(mockSyncMcpTools).toHaveBeenCalledWith(
      "notion",
      "email-account-123",
      expect.anything(),
    );
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith(
      "valid-auth-code",
      { connected: "notion" },
      { ttlSeconds: 600 },
    );
  });

  it("reports a tool sync failure without reporting the integration as connected", async () => {
    const state = generateSignedOAuthState({
      userId: "user-123",
      emailAccountId: "email-account-123",
      type: "notion-mcp",
    });
    mockSyncMcpTools.mockRejectedValue(new Error("Tool discovery failed"));

    const response = await GET(
      createRequest({
        queryState: state,
        cookieState: state,
      }),
      params,
    );

    const location = response.headers.get("location");
    expect(location).toContain("/email-account-123/integrations");
    expect(location).toContain("error=tool_sync_failed");
    expect(location).not.toContain("connected=notion");
    expect(mockSetOAuthCodeResult).toHaveBeenCalledWith(
      "valid-auth-code",
      { error: "tool_sync_failed" },
      { ttlSeconds: 600 },
    );
  });

  it("waits for an in-flight duplicate callback instead of exchanging the code twice", async () => {
    const state = generateSignedOAuthState({
      userId: "user-123",
      emailAccountId: "email-account-123",
      type: "notion-mcp",
    });
    mockClaimOAuthCodeAndWait.mockResolvedValue({
      result: {
        params: { connected: "notion" },
        status: "success",
      },
      status: "success",
      waited: true,
    });

    const responsePromise = GET(
      createRequest({
        queryState: state,
        cookieState: state,
      }),
      params,
    );
    const response = await responsePromise;

    expect(response.headers.get("location")).toContain("connected=notion");
    expect(mockHandleOAuthCallback).not.toHaveBeenCalled();
    expect(mockSyncMcpTools).not.toHaveBeenCalled();
  });
});
