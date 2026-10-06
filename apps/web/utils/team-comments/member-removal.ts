import type { Prisma } from "@/generated/prisma/client";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { publishConversationChange } from "@/utils/team-comments/events";

// Deleting a member cascades to the conversations it published and to its
// participant grants, so removal needs no extra writes. The affected ids are
// read before the delete because those rows are gone afterwards, and open
// streams still need a nudge to revalidate.
export async function prepareMemberRemovalNotifications(
  member: Prisma.MemberWhereInput,
  logger: Logger,
) {
  const conversations = await prisma.conversation.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { publisher: member },
        { participants: { some: { member, active: true } } },
      ],
    },
    select: { id: true },
  });
  return async () => {
    await Promise.all(
      conversations.map(({ id }) => publishConversationChange(id, logger)),
    );
  };
}
