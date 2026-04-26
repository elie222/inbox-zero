import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";

const paramsSchema = z.object({ id: z.string() });

export const POST = withEmailProvider(
  "threads/archive",
  async (request, context) => {
    const params = await context.params;
    const { id: threadId } = paramsSchema.parse(params);

    try {
      await request.emailProvider.archiveThreadWithLabel(
        threadId,
        request.auth.email,
      );

      return NextResponse.json({ success: true });
    } catch (error) {
      request.logger.error("Failed to archive thread", {
        error,
        threadId,
        emailAccountId: request.auth.emailAccountId,
      });
      return NextResponse.json(
        { error: "Failed to archive email" },
        { status: 500 },
      );
    }
  },
);
