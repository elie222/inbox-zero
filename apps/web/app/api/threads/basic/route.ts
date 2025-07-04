import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/threads/basic");

export type GetThreadsResponse = {
  threads: any[];
};

export const dynamic = "force-dynamic";

export const maxDuration = 30;

export const GET = withEmailAccount(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");

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

    // Get basic threads using the provider
    const threads = await emailProvider.getThreads(folderId || undefined);

    return NextResponse.json({ threads });
  } catch (error) {
    logger.error("Error fetching basic threads", { error, emailAccountId });
    return NextResponse.json(
      { error: "Failed to fetch threads" },
      { status: 500 },
    );
  }
});
