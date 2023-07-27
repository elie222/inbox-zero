import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import {
  sendEmail,
  sendEmailBody,
} from "@/app/api/google/messages/send/controller";
import { getGmailClient } from "@/utils/google";

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = sendEmailBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await sendEmail(gmail, body);

  return NextResponse.json(result);
}
