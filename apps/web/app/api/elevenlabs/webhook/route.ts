import { type NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("elevenlabs/webhook");

type TranscriptionEvent = {
  type: "post_call_transcription";
  event_timestamp: number;
  data: {
    agent_id: string;
    conversation_id: string;
    status: string;
    transcript: {
      role: string;
      message: string;
    }[];
    analysis: {
      transcript_summary: string;
    };
  };
};

export async function GET() {
  return NextResponse.json({ status: "webhook listening" }, { status: 200 });
}

export async function POST(req: NextRequest) {
  const secret = env.ELEVENLABS_WEBHOOK_SECRET;
  const { event, error } = await constructWebhookEvent(req, secret);

  if (error) {
    return NextResponse.json({ error: error }, { status: 401 });
  }

  if (!event) {
    return NextResponse.json({ error: "Invalid event" }, { status: 401 });
  }

  if (event.type === "post_call_transcription") {
    logger.info("event data", { event: event.data });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// From: https://elevenlabs.io/docs/conversational-ai/workflows/post-call-webhooks#authentication
const constructWebhookEvent = async (req: NextRequest, secret?: string) => {
  const body = await req.text();
  const signature_header = req.headers.get("ElevenLabs-Signature");

  if (!signature_header) {
    return { event: null, error: "Missing signature header" };
  }

  const headers = signature_header.split(",");
  const timestamp = headers.find((e) => e.startsWith("t="))?.substring(2);
  const signature = headers.find((e) => e.startsWith("v0="));

  if (!timestamp || !signature) {
    return { event: null, error: "Invalid signature format" };
  }

  // Validate timestamp
  const reqTimestamp = Number(timestamp) * 1000;
  const tolerance = Date.now() - 30 * 60 * 1000;
  if (reqTimestamp < tolerance) {
    return { event: null, error: "Request expired" };
  }

  // Validate hash
  const message = `${timestamp}.${body}`;

  if (!secret) {
    return { event: null, error: "Webhook secret not configured" };
  }

  const digest = `v0=${crypto.createHmac("sha256", secret).update(message).digest("hex")}`;
  if (signature !== digest) {
    return { event: null, error: "Invalid signature" };
  }

  const event = JSON.parse(body) as TranscriptionEvent;
  return { event, error: null };
};
