import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getThreads } from "@/app/api/google/threads/controller";
import { threadsQuery } from "@/app/api/google/threads/validation";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const limit = searchParams.get("limit");
  const fromEmail = searchParams.get("fromEmail");
  const type = searchParams.get("type");
  const nextPageToken = searchParams.get("nextPageToken");
  const q = searchParams.get("q");
  const labelId = searchParams.get("labelId");
  const query = threadsQuery.parse({
    limit,
    fromEmail,
    type,
    nextPageToken,
    q,
    labelId,
  });

  const { gmail, accessToken } = await getGmailAndAccessTokenForEmail({
    emailAccountId,
  });

  if (!accessToken) return NextResponse.json({ error: "Account not found" });

  const threads = await getThreads({
    query,
    emailAccountId,
    gmail,
    accessToken,
  });
  return NextResponse.json(threads);
});
