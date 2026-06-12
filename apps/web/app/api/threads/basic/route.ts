import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { threadsQuery } from "@/utils/threads/validation";

export type GetThreadsResponse = {
  threads: ThreadsResponse["threads"];
  nextPageToken?: string;
};

export const maxDuration = 30;

export const GET = withEmailProvider("threads/basic", async (request) => {
  const { emailProvider } = request;
  const { emailAccountId } = request.auth;

  const { searchParams } = new URL(request.url);
  const query = threadsQuery
    .pick({
      fromEmail: true,
      labelId: true,
      limit: true,
      nextPageToken: true,
    })
    .parse({
      fromEmail: searchParams.get("fromEmail"),
      labelId: searchParams.get("labelId"),
      limit: searchParams.get("limit"),
      nextPageToken: searchParams.get("nextPageToken"),
    });

  try {
    const { threads, nextPageToken } = await emailProvider.getThreadsWithQuery({
      query,
      maxResults: query.limit || 100,
      pageToken: query.nextPageToken || undefined,
    });

    return NextResponse.json({
      threads,
      nextPageToken,
    });
  } catch (error) {
    request.logger.error("Error fetching basic threads", {
      error,
      emailAccountId,
    });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
