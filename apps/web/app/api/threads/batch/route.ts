import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { ThreadsResponse } from "@/app/api/threads/route";
import { runWithBoundedConcurrency } from "@/utils/async";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";

export type ThreadsBatchResponse = {
  threads: ThreadsResponse["threads"];
};

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
    type Thread = Awaited<ReturnType<typeof emailProvider.getThread>>;
    type ThreadMessage = Thread["messages"][number];

    const results = await runWithBoundedConcurrency({
      items: threadIds,
      concurrency: THREAD_FETCH_CONCURRENCY,
      run: (threadId) => emailProvider.getThread(threadId),
    });

    for (const { item: threadId, result } of results) {
      if (result.status === "rejected") {
        request.logger.error("Error fetching thread", {
          error: result.reason,
          threadId,
        });
      }
    }

    const validThreads = (
      await Promise.all(
        results
          .filter((r) => r.result.status === "fulfilled")
          .map(async ({ result }) => {
            const thread = (result as PromiseFulfilledResult<Thread>).value;
            const filteredMessages = thread.messages.filter(
              (message: ThreadMessage) => {
                if (!message.headers?.from) return true;
                return !isIgnoredSender(message.headers.from);
              },
            );
            if (!filteredMessages.length) return null;

            return {
              id: thread.id,
              messages: filteredMessages,
              snippet: thread.snippet,
              plan: undefined,
            };
          }),
      )
    ).filter(Boolean) as ThreadsResponse["threads"];

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
