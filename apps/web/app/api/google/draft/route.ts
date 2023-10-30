import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import { draftEmail, sendEmailBody } from "@/utils/gmail/mail";

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = sendEmailBody.parse(json);

  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const gmail = getGmailClient(session);
  const draft = await draftEmail(gmail, body);

  return NextResponse.json(draft);
});
