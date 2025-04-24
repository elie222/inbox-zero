import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { loadEmails } from "@/app/api/user/stats/tinybird/load/load-emails";
import { loadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
import { getTokens } from "@/utils/account";
import { getGmailClient } from "@/utils/gmail/client";
import { getGmailAccessToken } from "@/utils/gmail/client";

export const maxDuration = 90;

export type LoadTinybirdEmailsResponse = Awaited<ReturnType<typeof loadEmails>>;

export const POST = withAuth(async (request) => {
  const email = request.auth.userEmail;

  const json = await request.json();
  const body = loadTinybirdEmailsBody.parse(json);

  const tokens = await getTokens({ email });

  const gmail = getGmailClient(tokens);
  const token = await getGmailAccessToken(tokens);

  const accessToken = token.token;
  if (!accessToken) return NextResponse.json({ error: "Missing access token" });

  const result = await loadEmails(
    {
      emailAccountId: email,
      gmail,
      accessToken,
    },
    body,
  );

  return NextResponse.json(result);
});
