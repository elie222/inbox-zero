import { z } from "zod";
import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import { parseMessages } from "@/utils/mail";
import prisma from "@/utils/prisma";
import { getCategory } from "@/utils/redis/category";
import { ExecutedRuleStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const threadQuery = z.object({ id: z.string() });
export type ThreadQuery = z.infer<typeof threadQuery>;
export type ThreadResponse = Awaited<ReturnType<typeof getThread>>;

const logger = createScopedLogger("api/threads/[id]");

async function getThread(
  id: string,
  includeDrafts: boolean,
  emailAccountId: string,
) {
  // Get the email account to determine the provider
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const provider = emailAccount.account.provider;
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
  });

  // Get the thread using the provider
  const thread = await emailProvider.getThread(id);

  // For the unified API, we return the thread with parsed messages
  // The parseMessages function expects a different format, so we handle it differently
  const filteredMessages = includeDrafts
    ? thread.messages
    : thread.messages.filter((msg) => !msg.labelIds?.includes("DRAFT"));

  return { thread: { ...thread, messages: filteredMessages } };
}

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailAccount(async (request, context) => {
  const emailAccountId = request.auth.emailAccountId;

  const params = await context.params;
  const { id } = threadQuery.parse(params);

  const { searchParams } = new URL(request.url);
  const includeDrafts = searchParams.get("includeDrafts") === "true";

  try {
    const thread = await getThread(id, includeDrafts, emailAccountId);
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
