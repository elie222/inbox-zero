import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("qstash-test");

function createRequest(headers?: Record<string, string>) {
  const request = new Request("https://example.com/api/test", {
    method: "POST",
    headers,
  }) as any;
  request.logger = logger;
  return request;
}

async function loadMiddleware({
  qstashToken,
  internalApiKeyValid,
  verifyResponse,
}: {
  qstashToken?: string;
  internalApiKeyValid: boolean;
  verifyResponse?: Response;
}) {
  vi.resetModules();

  const isValidInternalApiKey = vi.fn(() => internalApiKeyValid);
  const verifySignatureAppRouter = vi.fn((handler: (...args: any[]) => any) => {
    if (verifyResponse) return vi.fn(() => verifyResponse);
    return handler;
  });

  vi.doMock("@/env", () => ({
    env: {
      QSTASH_TOKEN: qstashToken,
    },
  }));
  vi.doMock("@/utils/internal-api", () => ({
    INTERNAL_API_KEY_HEADER: "x-api-key",
    isValidInternalApiKey,
  }));
  vi.doMock("@upstash/qstash/nextjs", () => ({
    verifySignatureAppRouter,
  }));

  const module = await import("./qstash");

  return {
    withQstashOrInternal: module.withQstashOrInternal,
    isValidInternalApiKey,
    verifySignatureAppRouter,
  };
}

describe("withQstashOrInternal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses QStash verification when configured even if internal key is present", async () => {
    const {
      withQstashOrInternal,
      isValidInternalApiKey,
      verifySignatureAppRouter,
    } = await loadMiddleware({
      qstashToken: "qstash-token",
      internalApiKeyValid: true,
      verifyResponse: new Response("verified"),
    });

    const handler = vi.fn(() => new Response("ok"));
    const wrapped = withQstashOrInternal(handler as any);

    const response = await wrapped(createRequest({ "x-api-key": "secret" }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
    expect(isValidInternalApiKey).not.toHaveBeenCalled();
    expect(verifySignatureAppRouter).toHaveBeenCalledTimes(1);
  });

  it("uses QStash signature verification when no internal key is provided", async () => {
    const verifiedResponse = new Response("verified");
    const { withQstashOrInternal, verifySignatureAppRouter } =
      await loadMiddleware({
        qstashToken: "qstash-token",
        internalApiKeyValid: false,
        verifyResponse: verifiedResponse,
      });

    const handler = vi.fn(() => new Response("ok"));
    const wrapped = withQstashOrInternal(handler as any);

    const response = await wrapped(createRequest(), {
      params: Promise.resolve({}),
    });

    expect(response).toBe(verifiedResponse);
    expect(verifySignatureAppRouter).toHaveBeenCalledTimes(1);
    expect(handler).not.toHaveBeenCalled();
  });

  it("returns unauthorized when QStash is disabled and no valid internal key is provided", async () => {
    const { withQstashOrInternal, isValidInternalApiKey } =
      await loadMiddleware({
        qstashToken: undefined,
        internalApiKeyValid: false,
      });

    const handler = vi.fn(() => new Response("ok"));
    const wrapped = withQstashOrInternal(handler as any);

    const response = await wrapped(createRequest(), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
    expect(isValidInternalApiKey).toHaveBeenCalledTimes(1);
  });

  it("uses internal API key when QStash is disabled", async () => {
    const { withQstashOrInternal, isValidInternalApiKey } =
      await loadMiddleware({
        qstashToken: undefined,
        internalApiKeyValid: true,
      });

    const handler = vi.fn(() => new Response("ok"));
    const wrapped = withQstashOrInternal(handler as any);

    const response = await wrapped(createRequest({ "x-api-key": "secret" }), {
      params: Promise.resolve({}),
    });

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(isValidInternalApiKey).toHaveBeenCalledTimes(1);
  });
});
