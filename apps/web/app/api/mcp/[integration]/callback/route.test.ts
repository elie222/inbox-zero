vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const { mockHandleOAuthCallback, mockSyncMcpTools, mockGetIntegration } =
  vi.hoisted(() => ({
    mockHandleOAuthCallback: vi.fn(),
    mockSyncMcpTools: vi.fn(),
    mockGetIntegration: vi.fn(() => ({ authType: "oauth" })),
  }));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/middleware", async () => {
  const { createScopedLogger } =
    await vi.importActual<typeof import("@/utils/logger")>("@/utils/logger");

  return {
    withError:
      (
        _name: string,
        handler: (
          request: NextRequest,
          context: { params: Promise<{ integration: string }> },
        ) => Promise<Response>,
      ) =>
      async (
        request: NextRequest,
        context: { params: Promise<{ integration: string }> },
      ) => {
        (
          request as NextRequest & {
            logger: ReturnType<typeof createScopedLogger>;
          }
        ).logger = createScopedLogger("test/mcp-callback");
        return handler(request, context);
      },
  };
});

vi.mock("@/utils/prisma");

vi.mock("@/utils/mcp/integrations", () => ({
  getIntegration: mockGetIntegration,
}));

vi.mock("@/utils/mcp/oauth", () => ({
  handleOAuthCallback: mockHandleOAuthCallback,
}));

vi.mock("@/utils/mcp/sync-tools", () => ({
  syncMcpTools: mockSyncMcpTools,
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
    mockGetIntegration.mockReturnValue({ authType: "oauth" });
    prisma.emailAccount.findFirst.mockResolvedValue({
      id: "email-account-123",
    } as Awaited<ReturnType<typeof prisma.emailAccount.findFirst>>);
    mockHandleOAuthCallback.mockResolvedValue(undefined);
    mockSyncMcpTools.mockResolvedValue({ toolsCount: 1 });
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
  });
});
