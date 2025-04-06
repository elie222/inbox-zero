import { redirect } from "next/navigation";
import { EnableReplyTracker } from "@/app/(app)/reply-zero/EnableReplyTracker";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ActionType } from "@prisma/client";

export default async function OnboardingReplyTracker() {
  const session = await auth();
  if (!session?.user.email) redirect("/login");

  const userId = session.user.id;

  const trackerRule = await prisma.rule.findFirst({
    where: { userId, actions: { some: { type: ActionType.TRACK_THREAD } } },
    select: { id: true },
  });

  return <EnableReplyTracker enabled={!!trackerRule?.id} />;
}
