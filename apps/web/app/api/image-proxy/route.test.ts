import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSafeImageProxyFetchMock, handleImageProxyRequestMock } =
  vi.hoisted(() => ({
    createSafeImageProxyFetchMock: vi.fn(),
    handleImageProxyRequestMock: vi.fn(),
  }));

vi.mock("@inboxzero/image-proxy/node-safe-fetch", () => ({
  createSafeImageProxyFetch: createSafeImageProxyFetchMock,
}));
vi.mock("@inboxzero/image-proxy/proxy-service", () => ({
  handleImageProxyRequest: handleImageProxyRequestMock,
}));
vi.mock("@/env", () => ({
  env: {
    IMAGE_PROXY_SIGNING_SECRET: "test-signing-secret-123",
  },
}));
vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import { GET, HEAD } from "./route";

describe("image-proxy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleImageProxyRequestMock.mockResolvedValue(
      new Response("ok", { status: 200 }),
    );
  });

  it("forwards GET requests to the shared proxy service with safe node fetch", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/image-proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
    );

    const response = await GET(request, {} as never);

    expect(response.status).toBe(200);
    expect(handleImageProxyRequestMock).toHaveBeenCalledWith(
      request,
      {
        allowUnsignedRequests: false,
        signingSecret: "test-signing-secret-123",
      },
      {
        fetchImpl: createSafeImageProxyFetchMock,
        logger: expect.anything(),
      },
    );
  });

  it("also supports HEAD requests", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/image-proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      { method: "HEAD" },
    );

    const response = await HEAD(request, {} as never);

    expect(response.status).toBe(200);
    expect(handleImageProxyRequestMock).toHaveBeenCalledTimes(1);
  });
});
