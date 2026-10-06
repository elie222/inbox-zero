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

  const parsed = loopsEmailEventSchema.safeParse(safeJsonParse(rawBody));
  const posthogEventName =
    parsed.success && POSTHOG_EVENT_NAMES[parsed.data.eventName];
  if (!parsed.success || !posthogEventName) {
    return NextResponse.json({ ok: true });
  }

  const event = parsed.data;
  // Contacts are created with the user's email, which is also the PostHog
  // distinct id, so these events join the user's product timeline.
  await posthogCaptureEvent(event.contactIdentity.email, posthogEventName, {
    loopsEventName: event.eventName,
    sourceType: event.sourceType ?? (event.loopId ? "loop" : undefined),
    loopId: event.loopId,
    loopName: event.loopName,
    campaignId: event.campaignId,
    campaignName: event.campaignName,
    emailMessageId: event.email?.emailMessageId,
    emailSubject: event.email?.subject,
  });

  return NextResponse.json({ ok: true });
});

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
