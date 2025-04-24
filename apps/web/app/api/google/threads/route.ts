import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { getThreads } from "@/app/api/google/threads/controller";
import { threadsQuery } from "@/app/api/google/threads/validation";
import { getGmailAccessToken } from "@/utils/gmail/client";
import { getTokens } from "@/utils/account";
import { getGmailClient } from "@/utils/gmail/client";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withAuth(async (request) => {
  const email = request.auth.userEmail;

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

  const tokens = await getTokens({ email });
  if (!tokens) return NextResponse.json({ error: "Account not found" });

  const gmail = getGmailClient(tokens);
  const token = await getGmailAccessToken(tokens);

  if (!token.token) return NextResponse.json({ error: "Account not found" });

  const threads = await getThreads({
    query,
    email,
    gmail,
    accessToken: token.token,
  });
  return NextResponse.json(threads);
});
