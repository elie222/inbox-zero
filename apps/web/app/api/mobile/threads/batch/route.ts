import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { runWithBoundedConcurrency } from "@/utils/async";
import { isThreadNotFoundError } from "@/utils/email/thread-not-found";
import type { EmailProvider } from "@/utils/email/types";

const THREAD_CONCURRENCY = 4;

export const maxDuration = 300;

const bodySchema = z.object({
  action: z.enum(["archive", "unarchive", "trash"]),
  threadIds: z.array(z.string().min(1)).min(1).max(500),
});

export type ThreadBatchResponse = {
  succeeded: string[];
  failed: string[];
};

/**
 * Applies one action to many threads in a single request, reporting the outcome
 * per thread so the caller can retry only the threads that failed. A thread
 * that no longer exists counts as succeeded, since the action it would have
 * undone is already gone.
 */
export const POST = withEmailProvider(
  "mobile/threads/batch",
  async (request) => {
    const { action, threadIds } = bodySchema.parse(await request.json());
    const uniqueThreadIds = [...new Set(threadIds)];

    const results = await runWithBoundedConcurrency({
      items: uniqueThreadIds,
      concurrency: THREAD_CONCURRENCY,
      run: (threadId) =>
        runThreadAction({
          action,
          threadId,
          emailProvider: request.emailProvider,
          ownerEmail: request.auth.email,
        }),
    });

    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const { item: threadId, result } of results) {
      if (result.status === "fulfilled") {
        succeeded.push(threadId);
      } else {
        failed.push(threadId);
        request.logger.warn("Failed to apply batch thread action", {
          action,
          threadId,
          error: result.reason,
        });
      }
    }

    return NextResponse.json({
      succeeded,
      failed,
    } satisfies ThreadBatchResponse);
  },
);

async function runThreadAction({
  action,
  threadId,
  emailProvider,
  ownerEmail,
}: {
  action: z.infer<typeof bodySchema>["action"];
  threadId: string;
  emailProvider: EmailProvider;
  ownerEmail: string;
}) {
  try {
    switch (action) {
      case "archive":
        return await emailProvider.archiveThreadWithLabel(threadId, ownerEmail);
      case "unarchive":
        return await emailProvider.unarchiveThread(threadId);
      case "trash":
        return await emailProvider.trashThread(threadId, ownerEmail, "user");
    }
  } catch (error) {
    if (isThreadNotFoundError(error)) return;
    throw error;
  }
}
