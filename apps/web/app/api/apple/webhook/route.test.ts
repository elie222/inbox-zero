import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { syncAppleSubscriptionToDbMock, verifyAppleNotificationPayloadMock } =
  vi.hoisted(() => ({
    syncAppleSubscriptionToDbMock: vi.fn(),
    verifyAppleNotificationPayloadMock: vi.fn(),
  }));

const env = vi.hoisted(() => ({
  SUPERWALL_APP_STORE_CONNECT_FORWARD_URL: undefined as string | undefined,
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

vi.mock("@/env", () => ({
  env,
}));

vi.mock("@/ee/billing/apple", () => ({
  syncAppleSubscriptionToDb: (...args: unknown[]) =>
    syncAppleSubscriptionToDbMock(...args),
  verifyAppleNotificationPayload: (...args: unknown[]) =>
    verifyAppleNotificationPayloadMock(...args),
}));

import { POST } from "./route";

function createRequest(body: unknown) {
  return new Request("https://example.com/api/apple/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Apple webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    env.SUPERWALL_APP_STORE_CONNECT_FORWARD_URL = undefined;
    vi.stubGlobal("fetch", vi.fn());
  });

  it("returns 400 when signedPayload is missing", async () => {
    const response = await POST(createRequest({}) as never);

    expect(response.status).toBe(400);
    expect(syncAppleSubscriptionToDbMock).not.toHaveBeenCalled();
    expect(verifyAppleNotificationPayloadMock).not.toHaveBeenCalled();
  });

  it("returns 400 when notification verification fails", async () => {
    verifyAppleNotificationPayloadMock.mockRejectedValueOnce(
      new Error("invalid notification"),
    );

    const response = await POST(
      createRequest({ signedPayload: "invalid" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Invalid signed payload" });
    expect(syncAppleSubscriptionToDbMock).not.toHaveBeenCalled();
  });

  it("syncs using the verified transaction id when present", async () => {
    verifyAppleNotificationPayloadMock.mockResolvedValueOnce({
      environment: "Sandbox",
      notification: {
        notificationType: "DID_RENEW",
        notificationUUID: "notif-1",
      },
      renewalInfo: {
        originalTransactionId: "orig-from-renewal",
      },
      transaction: {
        originalTransactionId: "orig-1",
        transactionId: "txn-1",
      },
    });
    syncAppleSubscriptionToDbMock.mockResolvedValueOnce(
      NextResponse.json({ ok: true }),
    );

    const response = await POST(
      createRequest({ signedPayload: "valid" }) as never,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ received: true });
    expect(syncAppleSubscriptionToDbMock).toHaveBeenCalledWith({
      environmentHint: "Sandbox",
      logger: expect.any(Object),
      originalTransactionId: "orig-1",
      transactionId: "txn-1",
    });
  });

  it("forwards the raw Apple webhook body to Superwall when configured", async () => {
    env.SUPERWALL_APP_STORE_CONNECT_FORWARD_URL =
      "https://superwall.example/webhook";
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200, statusText: "OK" }),
    );
    verifyAppleNotificationPayloadMock.mockResolvedValueOnce({
      environment: "Sandbox",
      notification: {
        notificationType: "DID_RENEW",
        notificationUUID: "notif-forward",
      },
      renewalInfo: {
        originalTransactionId: "orig-forward",
      },
      transaction: {
        originalTransactionId: "orig-forward",
        transactionId: "txn-forward",
      },
    });
    syncAppleSubscriptionToDbMock.mockResolvedValueOnce(null);

    const requestBody = {
      signedPayload: "valid",
      extraField: "preserve-me",
    };

    const response = await POST(createRequest(requestBody) as never);

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://superwall.example/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(requestBody),
      signal: expect.any(AbortSignal),
    });
  });

  it("continues processing when Superwall forwarding fails", async () => {
    env.SUPERWALL_APP_STORE_CONNECT_FORWARD_URL =
      "https://superwall.example/webhook";
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network error"));
    verifyAppleNotificationPayloadMock.mockResolvedValueOnce({
      environment: "Production",
      notification: {
        notificationType: "EXPIRED",
        notificationUUID: "notif-forward-error",
      },
      renewalInfo: {
        originalTransactionId: "orig-forward-error",
      },
      transaction: null,
    });
    syncAppleSubscriptionToDbMock.mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({ signedPayload: "valid" }) as never,
    );

    expect(response.status).toBe(200);
    expect(syncAppleSubscriptionToDbMock).toHaveBeenCalledWith({
      environmentHint: "Production",
      logger: expect.any(Object),
      originalTransactionId: "orig-forward-error",
      transactionId: null,
    });
  });

  it("falls back to the verified renewal original transaction id", async () => {
    verifyAppleNotificationPayloadMock.mockResolvedValueOnce({
      environment: "Production",
      notification: {
        notificationType: "EXPIRED",
        notificationUUID: "notif-2",
      },
      renewalInfo: {
        originalTransactionId: "orig-only",
      },
      transaction: null,
    });
    syncAppleSubscriptionToDbMock.mockResolvedValueOnce(null);

    const response = await POST(
      createRequest({ signedPayload: "valid" }) as never,
    );

    expect(response.status).toBe(200);
    expect(syncAppleSubscriptionToDbMock).toHaveBeenCalledWith({
      environmentHint: "Production",
      logger: expect.any(Object),
      originalTransactionId: "orig-only",
      transactionId: null,
    });
  });
});
