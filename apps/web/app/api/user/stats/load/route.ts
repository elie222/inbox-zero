import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { loadEmails } from "@/app/api/user/stats/load/load-emails";
import { loadEmailStatsBody } from "@/app/api/user/stats/load/validation";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";

export const maxDuration = 90;

export type LoadEmailStatsResponse = Awaited<ReturnType<typeof loadEmails>>;

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const json = await request.json();
  const body = loadEmailStatsBody.parse(json);

  const { gmail, accessToken } = await getGmailAndAccessTokenForEmail({
    emailAccountId,
  });

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
