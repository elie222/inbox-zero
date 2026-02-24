import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { ThreadsResponse } from "@/app/api/threads/route";

export type ThreadsBatchResponse = {
  threads: ThreadsResponse["threads"];
};

export const dynamic = "force-dynamic";

export const maxDuration = 30;
const THREAD_FETCH_CONCURRENCY = 5;

export const GET = withEmailProvider("threads/batch", async (request) => {
  const { emailProvider } = request;
  const { emailAccountId } = request.auth;

  const { searchParams } = new URL(request.url);
  const threadIdsParam = searchParams.get("threadIds");

  if (!threadIdsParam) {
    return NextResponse.json(
      { error: "threadIds parameter is required" },
      { status: 400 },
    );
  }

  const threadIds = threadIdsParam.split(",").filter(Boolean);

  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  try {
    const validThreads: ThreadsResponse["threads"] = [];

    // Bound parallel Gmail calls to reduce user-level rate limit bursts.
    for (let i = 0; i < threadIds.length; i += THREAD_FETCH_CONCURRENCY) {
      const batch = threadIds.slice(i, i + THREAD_FETCH_CONCURRENCY);

      const threads = await Promise.all(
        batch.map(async (threadId) => {
          try {
            return await emailProvider.getThread(threadId);
          } catch (error) {
            request.logger.error("Error fetching thread", { error, threadId });
            return null;
          }
        }),
      );

      validThreads.push(
        ...threads.filter(
          (thread): thread is ThreadsResponse["threads"][number] =>
            thread !== null,
        ),
      );
    }

    return NextResponse.json({ threads: validThreads });
  } catch (error) {
    request.logger.error("Error fetching batch threads", {
      error,
      emailAccountId,
    });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
