import { EnableReplyTracker } from "@/app/(app)/[emailAccountId]/reply-zero/EnableReplyTracker";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";

export default async function OnboardingReplyTracker(props: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const params = await props.params;

  const trackerRule = await prisma.rule.findFirst({
    where: {
      emailAccount: { id: params.emailAccountId },
      actions: { some: { type: ActionType.TRACK_THREAD } },
    },
    select: { id: true },
  });

  return <EnableReplyTracker enabled={!!trackerRule?.id} />;
}
