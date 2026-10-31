import { beforeEach, describe, expect, it, vi } from "vitest";
import { errors } from "jose";

vi.mock("server-only", () => ({}));

const {
  isMcpServerAvailable,
  getMcpIpRateLimitResponse,
  verifyMcpToken,
  handleMcpServerRequest,
  getJwks,
} = vi.hoisted(() => ({
  isMcpServerAvailable: vi.fn(),
  getMcpIpRateLimitResponse: vi.fn(),
  verifyMcpToken: vi.fn(),
  handleMcpServerRequest: vi.fn(),
  getJwks: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_BASE_URL: "https://inbox.example.com" },
}));
vi.mock("@/utils/auth", () => ({
  betterAuthConfig: { api: { getJwks } },
}));
vi.mock("@/utils/mcp/config", () => ({ isMcpServerAvailable }));
vi.mock("@/utils/mcp/rate-limit", () => ({
  getMcpIpRateLimitResponse,
}));
vi.mock("@/utils/mcp/verify-token", () => ({ verifyMcpToken }));
vi.mock("@/utils/mcp/server", () => ({ handleMcpServerRequest }));

import {
  handleMcpOptionsRequest,
  handleMcpPostRequest,
  handleMcpUnsupportedMethod,
} from "./http";

describe("MCP HTTP helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isMcpServerAvailable.mockReturnValue(true);
    getMcpIpRateLimitResponse.mockResolvedValue(null);
    getJwks.mockResolvedValue({ keys: [] });
  });

  it("returns 404 when the server flag is off", async () => {
    isMcpServerAvailable.mockReturnValue(false);
    const request = new Request("https://inbox.example.com/mcp", {
      method: "POST",
    });
    expect((await handleMcpPostRequest(request)).status).toBe(404);
    expect(handleMcpOptionsRequest().status).toBe(404);
    expect(handleMcpUnsupportedMethod().status).toBe(404);
    expect(verifyMcpToken).not.toHaveBeenCalled();
  });

  it("returns 401 without a bearer token", async () => {
    const response = await handleMcpPostRequest(
      new Request("https://inbox.example.com/mcp", { method: "POST" }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("WWW-Authenticate")).toContain(
      "https://inbox.example.com/.well-known/oauth-protected-resource",
    );
    expect(verifyMcpToken).not.toHaveBeenCalled();
  });

  it("returns 429 before verifying a token when the IP is limited", async () => {
    getMcpIpRateLimitResponse.mockResolvedValue(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    const response = await handleMcpPostRequest(
      new Request("https://inbox.example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(429);
    expect(verifyMcpToken).not.toHaveBeenCalled();
  });

  it("returns 401 for a JOSE verification failure", async () => {
    verifyMcpToken.mockRejectedValue(new errors.JOSEError("invalid"));
    const response = await handleMcpPostRequest(
      new Request("https://inbox.example.com/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer token" },
      }),
    );
    expect(response.status).toBe(401);
    expect(handleMcpServerRequest).not.toHaveBeenCalled();
  });

  it("delegates valid requests", async () => {
    verifyMcpToken.mockResolvedValue({
      userId: "owner",
      clientId: "client",
      scopes: ["mcp:read"],
    });
    handleMcpServerRequest.mockResolvedValue(new Response("ok"));
    const request = new Request("https://inbox.example.com/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer token" },
    });
    const allowed = await handleMcpPostRequest(request);
    expect(handleMcpServerRequest).toHaveBeenCalledWith(request, {
      userId: "owner",
      clientId: "client",
      scopes: ["mcp:read"],
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });
});
