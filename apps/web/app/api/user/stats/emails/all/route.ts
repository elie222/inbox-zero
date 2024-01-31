import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { loadIndexedDBMails } from "@/app/api/user/stats/emails/all/get-all";
import { loadIDBEmailsBody } from "@/app/api/user/stats/emails/all/validation";

export const maxDuration = 90;

/* TODO: Make the Reponse Return Type */
export type ResponseGmail = any;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();

  const body = loadIDBEmailsBody.parse(json);

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return NextResponse.json({ error: "Missing access token" });

  const result = await loadIndexedDBMails(
    {
      ownerEmail: session.user.email,
      gmail,
      accessToken: token.token,
    },
    body,
  );

  return NextResponse.json(result);
});
