import { after, NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { processWhatsAppEvent } from "@/utils/whatsapp/process-whatsapp-event";
import { verifyWhatsAppSignature } from "@inboxzero/whatsapp";

export const maxDuration = 120;

export const GET = withError("whatsapp/webhook", async (request) => {
  if (!env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json(
      { error: "WhatsApp webhook verification is not configured" },
      { status: 503 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json(
      { error: "Invalid verification request" },
      { status: 400 },
    );
  }

  if (token !== env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    return NextResponse.json(
      { error: "Invalid verify token" },
      { status: 403 },
    );
  }

  return new NextResponse(challenge, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
});

export const POST = withError("whatsapp/webhook", async (request) => {
  const logger = request.logger;

  if (!env.WHATSAPP_APP_SECRET) {
    return NextResponse.json(
      { error: "WhatsApp not configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const signatureHeader = request.headers.get("x-hub-signature-256");

  if (
    !verifyWhatsAppSignature(env.WHATSAPP_APP_SECRET, rawBody, signatureHeader)
  ) {
    logger.warn("Invalid WhatsApp signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload" },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      await processWhatsAppEvent(
        body as Parameters<typeof processWhatsAppEvent>[0],
        logger,
      );
    } catch (error) {
      logger.error("Error processing WhatsApp event", { error });
    }
  });

  return NextResponse.json({ ok: true });
});
