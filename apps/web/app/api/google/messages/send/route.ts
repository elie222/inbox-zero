import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";
import { sendEmail, sendEmailBody } from "@/utils/gmail/mail";

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = sendEmailBody.parse(json);

  const gmail = getGmailClient(session);

  const result = await sendEmail(gmail, body);

  return NextResponse.json(result);
});
