import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import type { ThreadsResponse } from "@/app/api/threads/route";

const logger = createScopedLogger("api/threads/batch");

export type ThreadsBatchResponse = {
  threads: ThreadsResponse["threads"];
};

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailProvider(async (request) => {
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
    // Get threads using the provider
    const threads = await Promise.all(
      threadIds.map(async (threadId) => {
        try {
          return await emailProvider.getThread(threadId);
        } catch (error) {
          logger.error("Error fetching thread", { error, threadId });
          return null;
        }
      }),
    );

    const validThreads = threads.filter(
      (thread): thread is ThreadsResponse["threads"][number] => thread !== null,
    );

    return NextResponse.json({ threads: validThreads });
  } catch (error) {
    logger.error("Error fetching batch threads", { error, emailAccountId });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
