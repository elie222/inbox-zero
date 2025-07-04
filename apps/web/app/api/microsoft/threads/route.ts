import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { getThreads } from "@/app/api/microsoft/threads/controller";
import { threadsQuery } from "@/app/api/microsoft/threads/validation";
import { getOutlookAndAccessTokenForEmail } from "@/utils/account";

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
  const folderId = searchParams.get("folderId");
  const query = threadsQuery.parse({
    limit,
    fromEmail,
    type,
    nextPageToken,
    q,
    folderId,
  });

  const { outlook, accessToken } = await getOutlookAndAccessTokenForEmail({
    emailAccountId,
  });

  if (!accessToken) return NextResponse.json({ error: "Account not found" });

  const threads = await getThreads({
    query,
    emailAccountId,
    outlook,
    accessToken,
  });
  return NextResponse.json(threads);
});
