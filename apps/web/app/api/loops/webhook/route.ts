import { NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { posthogCaptureEvent } from "@/utils/posthog";
import { verifyStandardWebhook } from "@/utils/webhooks/verify-standard-webhook";

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
  // Contacts are created with the user's email, which is also the PostHog
  // distinct id, so these events join the user's product timeline.
  const captured = await posthogCaptureEvent(
    event.contactIdentity.email,
    posthogEventName,
    {
      loopsEventName: event.eventName,
      sourceType: event.sourceType ?? getSourceType(event),
      loopId: event.loopId,
      loopName: event.loopName,
      campaignId: event.campaignId,
      campaignName: event.campaignName,
      emailMessageId: event.email?.emailMessageId,
      emailSubject: event.email?.subject,
    },
  );

  // Non-2xx so Loops redelivers instead of the event being lost.
  if (!captured) return new Response("Capture failed", { status: 500 });

  return NextResponse.json({ ok: true });
});

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
