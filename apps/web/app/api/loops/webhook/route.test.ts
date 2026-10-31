import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

const {
  envMock,
  posthogCaptureEventMock,
  getWorkflowNameMock,
  getCampaignNameMock,
} = vi.hoisted(() => ({
  envMock: { LOOPS_WEBHOOK_SIGNING_SECRET: "", LOOPS_API_SECRET: "" },
  posthogCaptureEventMock: vi.fn(),
  getWorkflowNameMock: vi.fn(),
  getCampaignNameMock: vi.fn(),
}));

vi.mock("@/env", () => ({ env: envMock }));
vi.mock("@/utils/prisma");

vi.mock("@inboxzero/loops", () => ({
  getWorkflowName: (...args: unknown[]) => getWorkflowNameMock(...args),
  getCampaignName: (...args: unknown[]) => getCampaignNameMock(...args),
}));

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
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("Loops webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    envMock.LOOPS_WEBHOOK_SIGNING_SECRET = SECRET;
    envMock.LOOPS_API_SECRET = "";
    posthogCaptureEventMock.mockResolvedValue(true);
    prisma.loopsEmailSource.findUnique.mockResolvedValue(null);
    prisma.loopsEmailSource.findFirst.mockResolvedValue(null);
    prisma.loopsEmailSource.upsert.mockResolvedValue({
      id: "source_1",
    } as never);
    getWorkflowNameMock.mockResolvedValue(null);
    getCampaignNameMock.mockResolvedValue(null);
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
        emailId: "email_1",
        emailMessageId: "message_1",
        emailSubject: "Welcome to Inbox Zero",
      }),
      false,
      {
        uuid: expect.stringMatching(UUID_PATTERN),
        timestamp: new Date(1_791_277_200 * 1000),
      },
    );
  });

  it("gives a redelivered event the same id so PostHog can drop the duplicate", async () => {
    const body = JSON.stringify({
      eventName: "email.opened",
      eventTime: 1_791_277_200,
      loopId: "loop_1",
      contactIdentity: { email: "user@example.com" },
    });

    await post(body);
    await post(body);
    await post(body, { deliveryId: "msg_2" });

    const uuids = posthogCaptureEventMock.mock.calls.map(
      (call) => call[4].uuid,
    );
    expect(uuids[0]).toBe(uuids[1]);
    expect(uuids[2]).not.toBe(uuids[0]);
  });

  it.each([
    ["loop.email.sent", "Loops email sent", { loopId: "loop_1" }, "loop"],
    [
      "campaign.email.sent",
      "Loops email sent",
      { campaignId: "campaign_1" },
      "campaign",
    ],
    ["email.opened", "Loops email opened", { loopId: "loop_1" }, "loop"],
    [
      "email.unsubscribed",
      "Loops email unsubscribed",
      { campaignId: "campaign_1" },
      "campaign",
    ],
    [
      "email.spamReported",
      "Loops email marked as spam",
      { loopId: "loop_1" },
      "loop",
    ],
    ["email.hardBounced", "Loops email bounced", { loopId: "loop_1" }, "loop"],
  ])("records %s as %s", async (loopsEventName, posthogEventName, source, sourceType) => {
    const response = await post(
      JSON.stringify({
        eventName: loopsEventName,
        ...source,
        email: { id: "email_1", emailMessageId: "message_1", subject: "Hi" },
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(200);
    expect(posthogCaptureEventMock).toHaveBeenCalledWith(
      "user@example.com",
      posthogEventName,
      expect.objectContaining({ ...source, sourceType }),
      false,
      expect.anything(),
    );
  });

  it("remembers a workflow name from the send that includes it", async () => {
    const response = await post(
      JSON.stringify({
        eventName: "loop.email.sent",
        loopId: "loop_1",
        loopName: "Welcome series",
        email: {
          id: "email_1",
          emailMessageId: "message_1",
          subject: "Welcome to Inbox Zero",
        },
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.loopsEmailSource.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailMessageId: "message_1" },
        create: expect.objectContaining({
          loopId: "loop_1",
          loopName: "Welcome series",
          sourceType: "loop",
        }),
      }),
    );
    expect(posthogCaptureEventMock).toHaveBeenCalledWith(
      "user@example.com",
      "Loops email sent",
      expect.objectContaining({
        loopId: "loop_1",
        loopName: "Welcome series",
        emailId: "email_1",
        emailMessageId: "message_1",
        emailSubject: "Welcome to Inbox Zero",
      }),
      false,
      expect.anything(),
    );
  });

  it.each([
    ["email.opened", "Loops email opened"],
    ["email.clicked", "Loops email clicked"],
    ["email.unsubscribed", "Loops email unsubscribed"],
    ["email.spamReported", "Loops email marked as spam"],
    ["email.hardBounced", "Loops email bounced"],
  ])("adds the workflow name Loops omits from %s", async (loopsEventName, posthogEventName) => {
    prisma.loopsEmailSource.findUnique.mockResolvedValue({
      loopName: "Welcome series",
      campaignName: null,
    });

    const response = await post(
      JSON.stringify({
        eventName: loopsEventName,
        sourceType: "loop",
        loopId: "loop_1",
        email: {
          id: "email_1",
          emailMessageId: "message_1",
          subject: "Welcome to Inbox Zero",
        },
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(200);
    expect(posthogCaptureEventMock).toHaveBeenCalledWith(
      "user@example.com",
      posthogEventName,
      expect.objectContaining({
        sourceType: "loop",
        loopId: "loop_1",
        loopName: "Welcome series",
        emailId: "email_1",
        emailMessageId: "message_1",
        emailSubject: "Welcome to Inbox Zero",
      }),
      false,
      expect.anything(),
    );
    expect(getWorkflowNameMock).not.toHaveBeenCalled();
  });

  it("adds the campaign name Loops omits from an open", async () => {
    prisma.loopsEmailSource.findUnique.mockResolvedValue({
      loopName: null,
      campaignName: "October update",
    });

    const response = await post(
      JSON.stringify({
        eventName: "email.opened",
        sourceType: "campaign",
        campaignId: "campaign_1",
        email: {
          id: "email_1",
          emailMessageId: "message_1",
          subject: "October update",
        },
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(200);
    expect(posthogCaptureEventMock).toHaveBeenCalledWith(
      "user@example.com",
      "Loops email opened",
      expect.objectContaining({
        sourceType: "campaign",
        campaignId: "campaign_1",
        campaignName: "October update",
        emailId: "email_1",
        emailMessageId: "message_1",
        emailSubject: "October update",
      }),
      false,
      expect.anything(),
    );
  });

  it("asks Loops to redeliver when PostHog does not accept the event", async () => {
    posthogCaptureEventMock.mockResolvedValue(false);

    const response = await post(
      JSON.stringify({
        eventName: "email.opened",
        loopId: "loop_1",
        contactIdentity: { email: "user@example.com" },
      }),
    );

    expect(response.status).toBe(500);
  });

  it("acknowledges a malformed tracked event without recording it", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await post(JSON.stringify({ eventName: "email.opened" }));

    expect(response.status).toBe(200);
    expect(posthogCaptureEventMock).not.toHaveBeenCalled();
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

function post(
  body: string,
  {
    secret = SECRET,
    deliveryId = "msg_1",
  }: { secret?: string; deliveryId?: string } = {},
) {
  return POST(signedRequest(body, secret, deliveryId) as NextRequest, {
    params: Promise.resolve({}),
  });
}

function signedRequest(body: string, secret: string, id: string) {
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
