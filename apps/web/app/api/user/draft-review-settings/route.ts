import { NextResponse } from "next/server";
import {
  DraftMaterializationMode,
  MessagingNotificationEventType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { withEmailAccount } from "@/utils/middleware";

export type GetDraftReviewSettingsResponse = Awaited<
  ReturnType<typeof getData>
>;

export const GET = withEmailAccount(
  "user/draft-review-settings",
  async (request) => {
    const result = await getData({
      emailAccountId: request.auth.emailAccountId,
    });

    return NextResponse.json(result);
  },
);

async function getData({ emailAccountId }: { emailAccountId: string }) {
  const [emailAccount, subscription] = await Promise.all([
    prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: {
        draftMaterializationMode: true,
      },
    }),
    prisma.messagingNotificationSubscription.findFirst({
      where: {
        emailAccountId,
        eventType: MessagingNotificationEventType.OUTBOUND_PROPOSAL_READY,
        enabled: true,
      },
      select: {
        messagingChannelId: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  return {
    enabled: Boolean(subscription),
    messagingChannelId: subscription?.messagingChannelId ?? null,
    draftMaterializationMode:
      emailAccount?.draftMaterializationMode ??
      DraftMaterializationMode.MAILBOX_DRAFT,
  };
}
