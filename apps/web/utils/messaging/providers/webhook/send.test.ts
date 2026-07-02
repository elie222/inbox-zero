import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendDigestToWebhook } from "./send";

const { httpsRequestMock, resolveSafeExternalHttpUrlMock } = vi.hoisted(() => ({
  httpsRequestMock: vi.fn(),
  resolveSafeExternalHttpUrlMock: vi.fn(),
}));

vi.mock("node:https", () => ({
  request: httpsRequestMock,
}));

vi.mock("@/utils/network/safe-http-url", () => ({
  resolveSafeExternalHttpUrl: (...args: unknown[]) =>
    resolveSafeExternalHttpUrlMock(...args),
}));

const payload = {
  type: "digest" as const,
  date: "2026-04-21T09:00:00.000Z",
  ruleNames: { newsletters: "Newsletters" },
  itemsByRule: {
    newsletters: [{ from: "Acme", subject: "Hello", content: "body" }],
  },
};

describe("sendDigestToWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveSafeExternalHttpUrlMock.mockResolvedValue({
      url: new URL("https://example.com/hook"),
      lookup: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws when the URL is blocked by SSRF protection", async () => {
    resolveSafeExternalHttpUrlMock.mockResolvedValue(null);

    await expect(
      sendDigestToWebhook({
        url: "http://169.254.169.254/latest",
        secret: null,
        payload,
      }),
    ).rejects.toThrow(/blocked by SSRF protection/);

    expect(httpsRequestMock).not.toHaveBeenCalled();
  });

  it("POSTs with the secret header and resolves on a 2xx response", async () => {
    const lookup = vi.fn();
    resolveSafeExternalHttpUrlMock.mockResolvedValue({
      url: new URL("https://example.com/hook"),
      lookup,
    });
    queueHttpsResponse({ statusCode: 204 });

    await expect(
      sendDigestToWebhook({
        url: "https://example.com/hook",
        secret: "shh",
        payload,
      }),
    ).resolves.toBeUndefined();

    expect(httpsRequestMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        lookup,
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Webhook-Secret": "shh",
        }),
      }),
      expect.any(Function),
    );
  });

  it("omits the secret header when no secret is set", async () => {
    queueHttpsResponse({ statusCode: 200 });

    await sendDigestToWebhook({
      url: "https://example.com/hook",
      secret: null,
      payload,
    });

    const headers = httpsRequestMock.mock.calls[0][1].headers as Record<
      string,
      string
    >;
    expect(headers).not.toHaveProperty("X-Webhook-Secret");
  });

  it("throws on a non-2xx response", async () => {
    queueHttpsResponse({ statusCode: 500 });

    await expect(
      sendDigestToWebhook({
        url: "https://example.com/hook",
        secret: null,
        payload,
      }),
    ).rejects.toThrow(/status 500/);
  });

  it("throws when a secret is configured for an HTTP URL", async () => {
    resolveSafeExternalHttpUrlMock.mockResolvedValue({
      url: new URL("http://example.com/hook"),
      lookup: vi.fn(),
    });

    await expect(
      sendDigestToWebhook({
        url: "http://example.com/hook",
        secret: "shh",
        payload,
      }),
    ).rejects.toThrow(/secret can only be sent over HTTPS/);

    expect(httpsRequestMock).not.toHaveBeenCalled();
  });
});

function queueHttpsResponse({ statusCode }: { statusCode: number }) {
  httpsRequestMock.mockImplementationOnce(
    (
      _url: URL,
      _options: Record<string, unknown>,
      callback: (response: {
        on: (event: string, handler: () => void) => void;
        resume: () => void;
        statusCode: number;
      }) => void,
    ) => {
      const request = {
        destroy: vi.fn(),
        end: vi.fn(() => {
          const response = {
            on: vi.fn((event: string, handler: () => void) => {
              if (event === "end") handler();
            }),
            resume: vi.fn(),
            statusCode,
          };
          callback(response);
        }),
        on: vi.fn(),
        setTimeout: vi.fn(),
        write: vi.fn(),
      };

      return request;
    },
  );
}
