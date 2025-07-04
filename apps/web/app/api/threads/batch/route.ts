import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/threads/batch");

export type ThreadsBatchResponse = {
  threads: any[];
};

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const threadIdsParam = searchParams.get("threadIds");

  if (!threadIdsParam) {
    return NextResponse.json(
      { error: "threadIds parameter is required" },
      { status: 400 },
    );
  }

  const threadIds = threadIdsParam.split(",").filter(Boolean);

  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  try {
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
      return NextResponse.json(
        { error: "Email account not found" },
        { status: 404 },
      );
    }

    const provider = emailAccount.account.provider;
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
    });

    // Get threads using the provider
    const threads = await Promise.all(
      threadIds.map(async (threadId) => {
        try {
          return await emailProvider.getThread(threadId);
        } catch (error) {
          logger.error("Error fetching thread", { error, threadId });
          return null;
        }
      }),
    );

    const validThreads = threads.filter(
      (thread): thread is any => thread !== null,
    );

    return NextResponse.json({ threads: validThreads });
  } catch (error) {
    logger.error("Error fetching batch threads", { error, emailAccountId });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
