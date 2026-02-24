import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { runWithBoundedConcurrency } from "@/utils/async";

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
    const results = await runWithBoundedConcurrency({
      items: threadIds,
      concurrency: THREAD_FETCH_CONCURRENCY,
      run: (threadId) => emailProvider.getThread(threadId),
    });

    const validThreads: ThreadsResponse["threads"] = [];

    for (const { item: threadId, result } of results) {
      if (result.status === "fulfilled") {
        validThreads.push(result.value);
      } else {
        request.logger.error("Error fetching thread", {
          error: result.reason,
          threadId,
        });
      }
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
