import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { loadEmails } from "@/app/api/user/stats/tinybird/load/load-emails";
import { loadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
import { getTokens } from "@/utils/account";
import { getGmailClient } from "@/utils/gmail/client";
import { getGmailAccessToken } from "@/utils/gmail/client";

export const maxDuration = 90;

export type LoadTinybirdEmailsResponse = Awaited<ReturnType<typeof loadEmails>>;

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const json = await request.json();
  const body = loadTinybirdEmailsBody.parse(json);

  const tokens = await getTokens({ emailAccountId });

  const gmail = getGmailClient(tokens);
  const token = await getGmailAccessToken(tokens);

  const accessToken = token.token;
  if (!accessToken) return NextResponse.json({ error: "Missing access token" });

  const result = await loadEmails(
    {
      emailAccountId,
      gmail,
      accessToken,
    },
    body,
  );

  return NextResponse.json(result);
});
