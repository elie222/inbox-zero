import { redirect } from "next/navigation";
import { EnableReplyTracker } from "@/app/(app)/reply-zero/EnableReplyTracker";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";

export default async function OnboardingReplyTracker() {
  const session = await auth();
  if (!session?.user.email) redirect("/login");

  const userId = session.user.id;

  const trackRepliesRule = await prisma.rule.findFirst({
    where: { userId, trackReplies: true },
    select: { trackReplies: true },
  });

  return <EnableReplyTracker enabled={!!trackRepliesRule?.trackReplies} />;
}
