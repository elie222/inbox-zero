import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import type { EmailProvider } from "@/utils/email/types";
import { parseMessageReply } from "@/utils/email/parse-message-reply";
import { getEmailProviderRateLimitMessage, SafeError } from "@/utils/error";
import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

async function getThread(
  id: string,
  includeDrafts: boolean,
  parseReplies: boolean,
  emailProvider: EmailProvider,
) {
  const thread = await emailProvider.getThread(id);

  let filteredMessages = includeDrafts
    ? thread.messages
    : thread.messages.filter((msg) => !msg.labelIds?.includes("DRAFT"));

  if (parseReplies) {
    filteredMessages = filteredMessages.map(parseMessageReply);
  }

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
    const { emailAccountId } = request.auth;

    const params = await context.params;
    const { id } = threadQuery.parse(params);

    const { searchParams } = new URL(request.url);
    const includeDrafts = searchParams.get("includeDrafts") === "true";
    const parseReplies = searchParams.get("parseReplies") === "true";

    try {
      const thread = await getThread(
        id,
        includeDrafts,
        parseReplies,
        emailProvider,
      );
      return NextResponse.json(thread);
    } catch (error) {
      if (
        isEmailProviderRateLimitError({
          error,
          provider: emailProvider.name,
        })
      ) {
        throw new SafeError(
          getEmailProviderRateLimitMessage(emailProvider.name),
          429,
        );
      }
      request.logger.error("Error fetching thread", {
        error,
        emailAccountId,
        threadId: id,
      });
      return NextResponse.json(
        { error: "Failed to fetch thread" },
        { status: 500 },
      );
    }
  },
);
