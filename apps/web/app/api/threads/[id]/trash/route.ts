import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { isThreadNotFoundError } from "@/utils/email/thread-not-found";

const paramsSchema = z.object({ id: z.string() });

/**
 * Moves a thread to trash / deleted items. This is not a permanent delete.
 */
export const POST = withEmailProvider(
  "threads/trash",
  async (request, context) => {
    const params = await context.params;
    const { id: threadId } = paramsSchema.parse(params);

    try {
      await request.emailProvider.trashThread(
        threadId,
        request.auth.email,
        "user",
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      if (isThreadNotFoundError(error)) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 },
        );
      }

      request.logger.error("Failed to trash thread", { error, threadId });
      return NextResponse.json(
        { error: "Failed to trash email" },
        { status: 500 },
      );
    }
  },
);
