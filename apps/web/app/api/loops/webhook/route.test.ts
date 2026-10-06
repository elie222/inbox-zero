import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { envMock, posthogCaptureEventMock } = vi.hoisted(() => ({
  envMock: { LOOPS_WEBHOOK_SIGNING_SECRET: "" },
  posthogCaptureEventMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: envMock }));

vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: (...args: unknown[]) => posthogCaptureEventMock(...args),
}));

vi.mock("@/utils/middleware", async () => {
  const { createWithErrorTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithErrorTestMiddleware();
});

import type { NextRequest } from "next/server";
import { POST } from "./route";

const SECRET = `whsec_${Buffer.from("loops-webhook-secret").toString("base64")}`;
const NOW = new Date("2026-10-06T09:00:00.000Z");

describe("Loops webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    envMock.LOOPS_WEBHOOK_SIGNING_SECRET = SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("records a clicked workflow email against the contact in PostHog", async () => {
    const response = await post(
      JSON.stringify({
        eventName: "email.clicked",
        eventTime: 1_791_277_200,
        webhookSchemaVersion: "1.0.0",
        sourceType: "loop",
        loopId: "loop_1",
        email: {
          id: "email_1",
          emailMessageId: "message_1",
          subject: "Welcome to Inbox Zero",
        },
        contactIdentity: {
          id: "contact_1",
          email: "user@example.com",
          userId: null,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(posthogCaptureEventMock).toHaveBeenCalledWith(
      "user@example.com",
      "Loops email clicked",
      expect.objectContaining({
        loopId: "loop_1",
        emailMessageId: "message_1",
        emailSubject: "Welcome to Inbox Zero",
      }),
    );
  });

  it("rejects a payload that is not signed with the configured secret", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await post(
      JSON.stringify({
        eventName: "email.opened",
        contactIdentity: { email: "user@example.com" },
      }),
      { secret: `whsec_${Buffer.from("wrong").toString("base64")}` },
    );

    expect(response.status).toBe(401);
    expect(posthogCaptureEventMock).not.toHaveBeenCalled();
  });

  it("acknowledges events it does not track without recording them", async () => {
    const response = await post(
      JSON.stringify({
        eventName: "contact.created",
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(200);
    expect(posthogCaptureEventMock).not.toHaveBeenCalled();
  });

  it("refuses deliveries when no signing secret is configured", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    envMock.LOOPS_WEBHOOK_SIGNING_SECRET = "";

    const response = await post(
      JSON.stringify({
        eventName: "email.opened",
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(503);
    expect(posthogCaptureEventMock).not.toHaveBeenCalled();
  });
});

function post(body: string, { secret = SECRET }: { secret?: string } = {}) {
  return POST(signedRequest(body, secret) as NextRequest, {
    params: Promise.resolve({}),
  });
}

function signedRequest(body: string, secret: string) {
  const id = "msg_1";
  const timestamp = Math.floor(NOW.getTime() / 1000);
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signature = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");

  return new Request("http://localhost:3000/api/loops/webhook", {
    method: "POST",
    body,
    headers: {
      "webhook-id": id,
      "webhook-timestamp": String(timestamp),
      "webhook-signature": `v1,${signature}`,
    },
  });
}
