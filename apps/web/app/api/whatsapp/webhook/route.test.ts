import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/middleware", async () => {
  const { createScopedLogger } = await import("@/utils/logger");

  return {
    withError:
      (
        _scope: string,
        handler: (
          request: NextRequest & {
            logger: ReturnType<typeof createScopedLogger>;
          },
          context: any,
        ) => any,
      ) =>
      async (request: NextRequest, context: any) => {
        const logger = createScopedLogger("test-whatsapp-webhook-route");
        return handler(Object.assign(request, { logger }), context);
      },
  };
});

const mockVerifyWhatsAppSignature = vi.fn();
vi.mock("@inboxzero/whatsapp", () => ({
  verifyWhatsAppSignature: (...args: unknown[]) =>
    mockVerifyWhatsAppSignature(...args),
}));

const mockProcessWhatsAppEvent = vi.fn().mockResolvedValue(undefined);
vi.mock("@/utils/whatsapp/process-whatsapp-event", () => ({
  processWhatsAppEvent: (...args: unknown[]) =>
    mockProcessWhatsAppEvent(...args),
}));

vi.mock("@/env", () => ({
  env: {
    WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify-token",
    WHATSAPP_APP_SECRET: "app-secret",
  },
}));

import { GET, POST } from "./route";

describe("whatsapp webhook route", () => {
  const context = { params: Promise.resolve({}) } as any;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns challenge for valid GET verification", async () => {
    const request = new NextRequest(
      "https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=1234",
    );

    const response = await GET(request, context);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toBe("1234");
  });

  it("rejects GET verification with invalid token", async () => {
    const request = new NextRequest(
      "https://example.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1234",
    );

    const response = await GET(request, context);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Invalid verify token");
  });

  it("rejects POST when signature is invalid", async () => {
    mockVerifyWhatsAppSignature.mockReturnValue(false);

    const request = new NextRequest(
      "https://example.com/api/whatsapp/webhook",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=bad",
        },
        body: JSON.stringify({ entry: [] }),
      },
    );

    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Invalid signature");
  });

  it("accepts POST when signature is valid", async () => {
    mockVerifyWhatsAppSignature.mockReturnValue(true);

    const request = new NextRequest(
      "https://example.com/api/whatsapp/webhook",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-hub-signature-256": "sha256=good",
        },
        body: JSON.stringify({ entry: [] }),
      },
    );

    const response = await POST(request, context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });
});
