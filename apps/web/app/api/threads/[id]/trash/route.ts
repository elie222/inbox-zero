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
    } catch (error) {
      // Both providers already treat a missing thread as success, so this only
      // catches the paths that surface it as an error.
      if (isThreadNotFoundError(error)) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 },
        );
      }
      // Rethrow so the middleware can map auth and rate limit failures to their
      // own status codes rather than flattening everything to 500.
      throw error;
    }

    return NextResponse.json({ success: true });
  },
);
