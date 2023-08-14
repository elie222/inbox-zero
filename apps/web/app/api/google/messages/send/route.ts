import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";
import { sendEmail, sendEmailBody } from "@/utils/gmail/mail";

export const POST = withError(async (request: Request) => {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = sendEmailBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await sendEmail(gmail, body);

  return NextResponse.json(result);
});
