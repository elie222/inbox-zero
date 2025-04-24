import { redirect } from "next/navigation";
import { EnableReplyTracker } from "@/app/(app)/[account]/reply-zero/EnableReplyTracker";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";

export default async function OnboardingReplyTracker() {
  const session = await auth();
  const emailAccountId = session?.user.email;
  if (!emailAccountId) redirect("/login");

  const trackerRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      actions: { some: { type: ActionType.TRACK_THREAD } },
    },
    select: { id: true },
  });

  return <EnableReplyTracker enabled={!!trackerRule?.id} />;
}
