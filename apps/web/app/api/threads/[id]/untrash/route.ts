import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { isThreadNotFoundError } from "@/utils/email/thread-not-found";

const paramsSchema = z.object({ id: z.string() });

/**
 * Moves a trashed thread back to the inbox, to undo
 * `POST /api/threads/[id]/trash`.
 */
export const POST = withEmailProvider(
  "threads/untrash",
  async (request, context) => {
    const params = await context.params;
    const { id: threadId } = paramsSchema.parse(params);

    try {
      await request.emailProvider.untrashThread(threadId);
    } catch (error) {
      if (isThreadNotFoundError(error)) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 },
        );
      }
      // Let the middleware map auth and rate limit failures to their own codes.
      throw error;
    }

    return NextResponse.json({ success: true });
  },
);
