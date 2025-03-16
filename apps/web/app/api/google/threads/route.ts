import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { getThreads } from "@/app/api/google/threads/controller";
import { threadsQuery } from "@/app/api/google/threads/validation";

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withError(async (request) => {
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

  const threads = await getThreads(query);
  return NextResponse.json(threads);
});
