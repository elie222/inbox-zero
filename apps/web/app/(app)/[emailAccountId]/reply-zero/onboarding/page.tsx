import { EnableReplyTracker } from "@/app/(app)/[emailAccountId]/reply-zero/EnableReplyTracker";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import prisma from "@/utils/prisma";
import { CONVERSATION_STATUS_TYPES } from "@/utils/reply-tracker/conversation-status-config";

export default async function OnboardingReplyTracker(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const trackerRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: { in: CONVERSATION_STATUS_TYPES },
    },
    select: { id: true },
  });

  return <EnableReplyTracker enabled={!!trackerRule} />;
}
