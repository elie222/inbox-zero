import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

const logger = createScopedLogger("api/threads/[id]");

async function getThread(
  id: string,
  includeDrafts: boolean,
  emailProvider: EmailProvider,
) {
  const thread = await emailProvider.getThread(id);

  const filteredMessages = includeDrafts
    ? thread.messages
    : thread.messages.filter((msg) => !msg.labelIds?.includes("DRAFT"));

  return { thread: { ...thread, messages: filteredMessages } };
}

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailProvider(async (request, context) => {
  const { emailProvider } = request;
  const { emailAccountId } = request.auth;

  const params = await context.params;
  const { id } = threadQuery.parse(params);

  const { searchParams } = new URL(request.url);
  const includeDrafts = searchParams.get("includeDrafts") === "true";

  try {
    const thread = await getThread(id, includeDrafts, emailProvider);
    return NextResponse.json(thread);
  } catch (error) {
    logger.error("Error fetching thread", {
      error,
      emailAccountId,
      threadId: id,
    });
    return NextResponse.json(
      { error: "Failed to fetch thread" },
      { status: 500 },
    );
  }
});
