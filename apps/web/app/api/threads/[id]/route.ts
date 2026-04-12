import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(
  id: string,
  includeDrafts: boolean,
  emailProvider: EmailProvider,
) {
  const thread = await emailProvider.getThread(id);

  const filteredMessages = includeDrafts
    ? thread.messages
    : thread.messages.filter((msg) => !msg.labelIds?.includes("DRAFT"));

  return {
    thread: {
      ...thread,
      messages: filteredMessages,
    },
  };
}

export const maxDuration = 30;

export const GET = withEmailProvider(
  "threads/detail",
  async (request, context) => {
    const { emailProvider } = request;

    const params = await context.params;
    const { id } = threadQuery.parse(params);

    const { searchParams } = new URL(request.url);
    const includeDrafts = searchParams.get("includeDrafts") === "true";

    const thread = await getThread(id, includeDrafts, emailProvider);
    return NextResponse.json(thread);
  },
);
