import { beforeEach, describe, expect, it, vi } from "vitest";
import McpConsentPage from "@/app/(landing)/mcp/consent/page";

const { auth, getOAuthClientPublic } = vi.hoisted(() => ({
  auth: vi.fn(),
  getOAuthClientPublic: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/utils/auth", () => ({
  auth,
  betterAuthConfig: { api: { getOAuthClientPublic } },
}));
vi.mock("@/utils/mcp/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/mcp/config")>()),
  isMcpServerAvailable: () => true,
}));
vi.mock("@/utils/mcp/access", () => ({
  getMcpServerAccess: async () => ({ available: true, enabled: true }),
}));
vi.mock("@/app/(landing)/mcp/consent/McpConsent", () => ({
  McpConsent: () => null,
}));

const searchParams = {
  client_id: "client-1",
  scope: "mcp:read offline_access",
  sig: "signature",
};

describe("MCP consent page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getOAuthClientPublic.mockResolvedValue({ client_name: "Test client" });
  });

  it("does not look up the client for an email code session", async () => {
    auth.mockResolvedValue({
      user: { id: "user-1" },
      session: { emailOtp: true },
    });
    await expect(
      McpConsentPage({ searchParams: Promise.resolve(searchParams) }),
    ).resolves.toBeTruthy();
    expect(getOAuthClientPublic).not.toHaveBeenCalled();
  });

  it("looks up the client for a provider session", async () => {
    auth.mockResolvedValue({
      user: { id: "user-1" },
      session: { emailOtp: false },
    });
    await McpConsentPage({ searchParams: Promise.resolve(searchParams) });
    expect(getOAuthClientPublic).toHaveBeenCalledWith(
      expect.objectContaining({ query: { client_id: "client-1" } }),
    );
  });
});
