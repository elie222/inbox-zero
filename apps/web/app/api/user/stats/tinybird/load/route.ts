import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { loadEmails } from "@/app/api/user/stats/tinybird/load/load-emails";
import { loadTinybirdEmailsBody } from "@/app/api/user/stats/tinybird/load/validation";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";

export const maxDuration = 90;

export type LoadTinybirdEmailsResponse = Awaited<ReturnType<typeof loadEmails>>;

export const POST = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const json = await request.json();
  const body = loadTinybirdEmailsBody.parse(json);

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
