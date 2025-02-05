import prisma from "@/utils/prisma";

export async function getReplyTrackingRule(userId: string) {
  const replyTrackingRule = await prisma.rule.findFirst({
    where: { userId, trackReplies: true },
  });
  return replyTrackingRule;
}
