import { beforeEach, describe, expect, it, vi } from "vitest";
import { handler } from "./handler";
import { handleImageProxyRequest } from "@inboxzero/image-proxy/proxy-service";

vi.mock("@inboxzero/image-proxy/proxy-service", () => ({
  handleImageProxyRequest: vi.fn(),
}));

describe("handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Reflect.deleteProperty(process.env, "IMAGE_PROXY_SIGNING_SECRET");
  });

  it("forwards the reconstructed request URL and returns text responses directly", async () => {
    vi.mocked(handleImageProxyRequest).mockResolvedValue(
      new Response("ok", {
        status: 202,
        headers: { "content-type": "text/plain" },
      }),
    );

    const response = await handler({
      headers: {
        "x-forwarded-proto": "http",
        "x-forwarded-host": "proxy.example.com",
      },
      rawPath: "/proxy",
      rawQueryString: "u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
      requestContext: { http: { method: "GET" } },
    });

    expect(response).toEqual({
      body: "ok",
      headers: { "content-type": "text/plain" },
      statusCode: 202,
    });

    expect(handleImageProxyRequest).toHaveBeenCalledTimes(1);
    const [request, config] = vi.mocked(handleImageProxyRequest).mock.calls[0];
    expect(request.url).toBe(
      "http://proxy.example.com/proxy?u=https%3A%2F%2Fcdn.example.com%2Fphoto.png",
    );
    expect(request.method).toBe("GET");
    expect(config).toEqual({ signingSecret: undefined });
  });

  it("base64-encodes binary responses for Lambda", async () => {
    vi.mocked(handleImageProxyRequest).mockResolvedValue(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const response = await handler({
      requestContext: { http: { method: "GET" } },
    });

    expect(response).toEqual({
      body: "AQID",
      headers: { "content-type": "image/png" },
      isBase64Encoded: true,
      statusCode: 200,
    });
  });

  it("returns empty bodies for HEAD requests", async () => {
    vi.mocked(handleImageProxyRequest).mockResolvedValue(
      new Response("ignored", {
        status: 200,
        headers: { "content-type": "image/png" },
      }),
    );

    const response = await handler({
      requestContext: { http: { method: "HEAD" } },
    });

    expect(response).toEqual({
      body: "",
      headers: { "content-type": "image/png" },
      statusCode: 200,
    });
  });

  it("decodes base64 request bodies before passing them downstream", async () => {
    vi.mocked(handleImageProxyRequest).mockResolvedValue(
      new Response("accepted", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await handler({
      body: "cGF5bG9hZA==",
      headers: { host: "proxy.example.com" },
      isBase64Encoded: true,
      rawPath: "/proxy",
      requestContext: { http: { method: "POST" } },
    });

    const [request] = vi.mocked(handleImageProxyRequest).mock.calls[0];
    await expect(request.text()).resolves.toBe("payload");
  });

  it("does not attach a body to GET requests", async () => {
    vi.mocked(handleImageProxyRequest).mockResolvedValue(
      new Response("ok", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(
      handler({
        body: "cGF5bG9hZA==",
        headers: { host: "proxy.example.com" },
        isBase64Encoded: true,
        rawPath: "/proxy",
        requestContext: { http: { method: "GET" } },
      }),
    ).resolves.toMatchObject({ statusCode: 200 });

    const [request] = vi.mocked(handleImageProxyRequest).mock.calls[0];
    await expect(request.text()).resolves.toBe("");
  });

  it("preserves bodies for API Gateway v1 requests", async () => {
    vi.mocked(handleImageProxyRequest).mockResolvedValue(
      new Response("accepted", {
        status: 200,
        headers: { "content-type": "text/plain" },
      }),
    );

    await handler({
      body: "payload",
      headers: { host: "proxy.example.com" },
      httpMethod: "POST",
      rawPath: "/proxy",
    });

    const [request] = vi.mocked(handleImageProxyRequest).mock.calls[0];
    expect(request.method).toBe("POST");
    await expect(request.text()).resolves.toBe("payload");
  });
});
