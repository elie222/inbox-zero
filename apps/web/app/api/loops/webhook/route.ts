import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { posthogCaptureEvent } from "@/utils/posthog";
import { verifyStandardWebhook } from "@/utils/webhooks/verify-standard-webhook";
import { enrichLoopsEmailNames } from "./email-source";

const POSTHOG_EVENT_NAMES: Record<string, string> = {
  "loop.email.sent": "Loops email sent",
  "campaign.email.sent": "Loops email sent",
  "email.opened": "Loops email opened",
  "email.clicked": "Loops email clicked",
  "email.unsubscribed": "Loops email unsubscribed",
  "email.spamReported": "Loops email marked as spam",
  "email.hardBounced": "Loops email bounced",
};

const loopsEmailEventSchema = z.object({
  eventName: z.string(),
  eventTime: z.number().optional(),
  sourceType: z.string().optional(),
  loopId: z.string().nullish(),
  loopName: z.string().nullish(),
  campaignId: z.string().nullish(),
  campaignName: z.string().nullish(),
  email: z
    .object({
      id: z.string(),
      emailMessageId: z.string().nullish(),
      subject: z.string().nullish(),
    })
    .optional(),
  contactIdentity: z.object({ email: z.string() }),
});

export const POST = withError("loops/webhook", async (request) => {
  const logger = request.logger;

  if (!env.LOOPS_WEBHOOK_SIGNING_SECRET) {
    logger.error("Received a Loops webhook but no secret is configured");
    return new Response("Not configured", { status: 503 });
  }

  const rawBody = await request.text();

  const verification = verifyStandardWebhook({
    secret: env.LOOPS_WEBHOOK_SIGNING_SECRET,
    headers: request.headers,
    rawBody,
  });
  if (!verification.verified) {
    logger.warn("Rejected Loops webhook with an invalid signature", {
      verificationFailureReason: verification.reason,
    });
    return new Response("Invalid signature", { status: 401 });
  }

  const payload = safeJsonParse(rawBody);
  const loopsEventName = getEventName(payload);
  const posthogEventName =
    loopsEventName && POSTHOG_EVENT_NAMES[loopsEventName];
  if (!posthogEventName) return NextResponse.json({ ok: true });

  const parsed = loopsEmailEventSchema.safeParse(payload);
  if (!parsed.success) {
    logger.warn("Ignored malformed Loops webhook", {
      loopsEventName,
      errors: parsed.error.issues,
    });
    return NextResponse.json({ ok: true });
  }

  const event = parsed.data;
  // Send webhooks include the workflow or campaign name. Opens, clicks, and
  // the other engagement events only include the id, so copy the name across.
  const names = await enrichLoopsEmailNames(
    {
      sourceType: event.sourceType,
      loopId: event.loopId,
      loopName: event.loopName,
      campaignId: event.campaignId,
      campaignName: event.campaignName,
      emailMessageId: event.email?.emailMessageId,
      eventTime: event.eventTime ? new Date(event.eventTime * 1000) : null,
    },
    logger,
  );
  // Contacts are created with the user's email, which is also the PostHog
  // distinct id, so these events join the user's product timeline.
  const captured = await posthogCaptureEvent(
    event.contactIdentity.email,
    posthogEventName,
    {
      loopsEventName: event.eventName,
      sourceType: event.sourceType ?? getSourceType(event),
      loopId: event.loopId,
      loopName: names.loopName,
      campaignId: event.campaignId,
      campaignName: names.campaignName,
      emailId: event.email?.id,
      emailMessageId: event.email?.emailMessageId,
      emailSubject: event.email?.subject,
    },
    false,
    {
      uuid: getDeliveryUuid(request.headers),
      timestamp: event.eventTime ? new Date(event.eventTime * 1000) : undefined,
    },
  );

  // Non-2xx so Loops redelivers instead of the event being lost.
  if (!captured) return new Response("Capture failed", { status: 500 });

  return NextResponse.json({ ok: true });
});

// Loops redelivers with the same webhook id, so derive a stable UUID from it.
function getDeliveryUuid(headers: Headers): string | undefined {
  const deliveryId = headers.get("webhook-id") ?? headers.get("svix-id");
  if (!deliveryId) return;

  const hex = createHash("sha256").update(deliveryId).digest("hex");
  const variant = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function getEventName(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) return;
  const { eventName } = payload as { eventName?: unknown };
  return typeof eventName === "string" ? eventName : undefined;
}

function getSourceType(event: {
  loopId?: string | null;
  campaignId?: string | null;
}) {
  if (event.loopId) return "loop";
  if (event.campaignId) return "campaign";
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
