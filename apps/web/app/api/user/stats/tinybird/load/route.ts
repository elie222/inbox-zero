import { NextResponse } from "next/server";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { withError } from "@/utils/middleware";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import { loadTinybirdEmails } from "@/app/api/user/stats/tinybird/load/load-emails";
import { loadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";

export const maxDuration = 90;

export type LoadTinybirdEmailsResponse = Awaited<
  ReturnType<typeof loadTinybirdEmails>
>;

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = loadTinybirdEmailsBody.parse(json);

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return NextResponse.json({ error: "Missing access token" });

  const result = await loadTinybirdEmails(
    {
      ownerEmail: session.user.email,
      gmail,
      accessToken: token.token,
    },
    body,
  );

  return NextResponse.json(result);
});
