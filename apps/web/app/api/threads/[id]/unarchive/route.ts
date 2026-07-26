import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { isThreadNotFoundError } from "@/utils/email/thread-not-found";

const paramsSchema = z.object({ id: z.string() });

/**
 * Moves a thread back to the inbox, to undo `POST /api/threads/[id]/archive`.
 */
export const POST = withEmailProvider(
  "threads/unarchive",
  async (request, context) => {
    const params = await context.params;
    const { id: threadId } = paramsSchema.parse(params);

    try {
      await request.emailProvider.unarchiveThread(threadId);

      return NextResponse.json({ success: true });
    } catch (error) {
      if (isThreadNotFoundError(error)) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 },
        );
      }

      request.logger.error("Failed to unarchive thread", { error, threadId });
      return NextResponse.json(
        { error: "Failed to unarchive email" },
        { status: 500 },
      );
    }
  },
);
