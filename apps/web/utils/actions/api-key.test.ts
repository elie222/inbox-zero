import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  updateMcpServerAccessAction,
  createApiKeyAction,
  deactivateApiKeyAction,
} from "@/utils/actions/api-key";
import prisma from "@/utils/__mocks__/prisma";

const { currentSession, mcpFlags } = vi.hoisted(() => ({
  currentSession: { emailOtp: false },
  mcpFlags: { enabled: true },
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "owner@example.com" },
    session: currentSession,
  })),
}));
vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    env: {
      ...actual.env,
      NEXT_PUBLIC_EXTERNAL_API_ENABLED: true,
      get MCP_SERVER_ENABLED() {
        return mcpFlags.enabled;
      },
      API_KEY_SALT: "test-api-key-salt",
    },
  };
});

describe("API key actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSession.emailOtp = false;
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "user-1", provider: "google" },
    } as never);
  });

  it("rejects permanent key creation from an email code session", async () => {
    currentSession.emailOtp = true;
    const result = await createApiKeyAction("account-1", {
      scopes: ["RULES_READ"],
      expiresIn: "never",
    });
    expect(result?.serverError).toBe(
      "Sign in with your connected provider to manage API keys.",
    );
    expect(prisma.apiKey.create).not.toHaveBeenCalled();
  });

  it("allows provider sessions to create a permanent key", async () => {
    const result = await createApiKeyAction("account-1", {
      scopes: ["RULES_READ"],
      expiresIn: "never",
    });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data?.secretKey).toBeTruthy();
    expect(prisma.apiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ expiresAt: null, userId: "user-1" }),
    });
  });

  it("rejects key management from an email code session", async () => {
    currentSession.emailOtp = true;
    const result = await deactivateApiKeyAction("account-1", { id: "key-1" });
    expect(result?.serverError).toBe(
      "Sign in with your connected provider to manage API keys.",
    );
    expect(prisma.apiKey.update).not.toHaveBeenCalled();
  });
});

it("revokes grants and advances the token version when MCP is disabled", async () => {
  currentSession.emailOtp = false;
  prisma.$transaction.mockResolvedValue([]);
  const result = await updateMcpServerAccessAction({ enabled: false });
  expect(result?.data).toEqual({ enabled: false });
  expect(prisma.user.update).toHaveBeenCalledWith({
    where: { id: "user-1" },
    data: { mcpServerEnabled: false, mcpTokenVersion: { increment: 1 } },
  });
  expect(prisma.oauthConsent.deleteMany).toHaveBeenCalledWith({
    where: { userId: "user-1" },
  });
  expect(prisma.oauthRefreshToken.deleteMany).toHaveBeenCalledWith({
    where: { userId: "user-1" },
  });
  expect(prisma.oauthAccessToken.deleteMany).toHaveBeenCalledWith({
    where: { userId: "user-1" },
  });
});

it("blocks MCP enablement from an email code session", async () => {
  vi.clearAllMocks();
  currentSession.emailOtp = true;
  const result = await updateMcpServerAccessAction({ enabled: true });
  expect(result?.serverError).toContain("connected provider");
  expect(prisma.user.update).not.toHaveBeenCalled();
});

it("allows revocation while the MCP server is unavailable", async () => {
  vi.clearAllMocks();
  currentSession.emailOtp = false;
  mcpFlags.enabled = false;
  try {
    const result = await updateMcpServerAccessAction({ enabled: false });
    expect(result?.data).toEqual({ enabled: false });
    expect(prisma.oauthConsent.deleteMany).toHaveBeenCalled();
    const enableResult = await updateMcpServerAccessAction({ enabled: true });
    expect(enableResult?.serverError).toBe("MCP server is not enabled");
  } finally {
    mcpFlags.enabled = true;
  }
});
