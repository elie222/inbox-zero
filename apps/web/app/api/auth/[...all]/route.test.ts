vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getHandlerMock,
  postHandlerMock,
  getSessionMock,
  isMcpServerEnabledForUserMock,
} = vi.hoisted(() => ({
  getHandlerMock: vi.fn(),
  postHandlerMock: vi.fn(),
  getSessionMock: vi.fn(),
  isMcpServerEnabledForUserMock: vi.fn(),
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn(() => ({
    GET: getHandlerMock,
    POST: postHandlerMock,
  })),
}));
vi.mock("@/utils/auth", () => ({
  betterAuthConfig: {
    api: {
      getSession: getSessionMock,
    },
  },
}));
vi.mock("@/utils/mcp/access", () => ({
  isMcpServerEnabledForUser: isMcpServerEnabledForUserMock,
}));

import { GET, POST } from "./route";

describe("auth catch-all route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getHandlerMock.mockResolvedValue(new Response("get ok"));
    postHandlerMock.mockResolvedValue(new Response("post ok"));
    getSessionMock.mockResolvedValue(null);
    isMcpServerEnabledForUserMock.mockResolvedValue(false);
  });

  it("delegates non-MCP GET requests to Better Auth", async () => {
    const request = new NextRequest("http://localhost:3000/api/auth/session");

    const response = await GET(request);

    expect(getHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBeInstanceOf(Response);
  });

  it("allows unauthenticated MCP authorize requests to continue to Better Auth", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/auth/mcp/authorize",
    );

    const response = await GET(request);

    expect(isMcpServerEnabledForUserMock).not.toHaveBeenCalled();
    expect(getHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBeInstanceOf(Response);
  });

  it("blocks MCP authorize when the signed-in user has not enabled access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user_1" } });

    const response = await GET(
      new NextRequest("http://localhost:3000/api/auth/mcp/authorize"),
    );

    expect(isMcpServerEnabledForUserMock).toHaveBeenCalledWith("user_1");
    expect(getHandlerMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "MCP access is not enabled for this user.",
    });
  });

  it("allows MCP authorize when the signed-in user has enabled access", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "user_1" } });
    isMcpServerEnabledForUserMock.mockResolvedValue(true);
    const request = new NextRequest(
      "http://localhost:3000/api/auth/mcp/authorize",
    );

    const response = await GET(request);

    expect(getHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBeInstanceOf(Response);
  });

  it("delegates POST requests to Better Auth", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/auth/mcp/token",
      {
        method: "POST",
      },
    );

    const response = await POST(request);

    expect(postHandlerMock).toHaveBeenCalledWith(request);
    expect(response).toBeInstanceOf(Response);
  });
});
