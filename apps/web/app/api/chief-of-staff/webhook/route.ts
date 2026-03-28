import { NextResponse } from "next/server";
import { after } from "next/server";
import { processChiefOfStaffWebhook } from "./process";

export async function POST(request: Request) {
  // Verify Pub/Sub token
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  if (token !== process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  // Decode Pub/Sub message
  const body = await request.json();
  const message = body.message;
  if (!message?.data) return NextResponse.json({ ok: true });

  const decoded = JSON.parse(Buffer.from(message.data, "base64").toString());

  // Acknowledge immediately, process async
  after(() => processChiefOfStaffWebhook(decoded));
  return NextResponse.json({ ok: true });
}
