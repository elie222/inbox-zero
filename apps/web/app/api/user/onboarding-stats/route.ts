import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";

export type OnboardingStatsResponse = Awaited<
  ReturnType<typeof getOnboardingStats>
>;

async function getOnboardingStats({ userId }: { userId: string }) {
  // Get the user's email account (they should have one after Gmail connection)
  const emailAccount = await prisma.emailAccount.findFirst({
    where: { userId },
    include: {
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  if (!emailAccount) {
    throw new Error("No email account found for user");
  }

  // Create email provider
  const emailProvider = await createEmailProvider({
    emailAccountId: emailAccount.id,
    provider: emailAccount.account.provider,
  });

  const now = new Date();
  const twentyFourHoursAgo = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );

  // Get unread count by using the same query as Gmail UI: "in:inbox is:unread"
  const unreadMessages = await emailProvider.getMessagesWithPagination({
    query: "in:inbox is:unread",
    maxResults: 1000, // Gmail API limit
  });

  const unreadCount = unreadMessages.messages?.length || 0;

  // Get yesterday's email count by fetching messages
  const yesterdayEmails = await emailProvider.getMessagesByFields({
    after: twentyFourHoursAgo,
    excludeSent: true,
    maxResults: 500,
  });

  return {
    unreadCount,
    yesterdayCount: yesterdayEmails.messages?.length || 0,
  };
}

export const GET = withAuth(async (request) => {
  const result = await getOnboardingStats({ userId: request.auth.userId });
  return NextResponse.json(result);
});
