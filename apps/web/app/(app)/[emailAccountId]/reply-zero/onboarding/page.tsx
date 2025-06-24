import { EnableReplyTracker } from "@/app/(app)/[emailAccountId]/reply-zero/EnableReplyTracker";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";

export default async function OnboardingReplyTracker(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await props.params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  const trackerRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      actions: { some: { type: ActionType.TRACK_THREAD } },
    },
    select: { id: true },
  });

  return <EnableReplyTracker enabled={!!trackerRule?.id} />;
}
