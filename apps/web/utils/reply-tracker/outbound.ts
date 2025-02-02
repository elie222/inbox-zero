import type { gmail_v1 } from "@googleapis/gmail";
import { aiCheckIfNeedsReply } from "@/utils/ai/reply/check-if-needs-reply";
import { getThreadMessages } from "@/utils/gmail/thread";
import type { UserEmailWithAI } from "@/utils/llms/types";
import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";
import { ThreadTrackerType, type User } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { getEmailForLLM } from "@/utils/ai/choose-rule/get-email-from-message";

const logger = createScopedLogger("outbound-reply");

export async function handleOutboundReply(
  user: Pick<User, "id" | "about"> & UserEmailWithAI,
  message: ParsedMessage,
  gmail: gmail_v1.Gmail,
) {
  const userId = user.id;

  // When we send a reply, resolve any existing "NEEDS_REPLY" trackers
  await resolveReplyTrackers(userId, message.threadId);

  const threadMessages = await getThreadMessages(message.threadId, gmail);

  if (!threadMessages?.length) {
    logger.error("No thread messages found", {
      email: user.email,
      messageId: message.id,
      threadId: message.threadId,
    });
    return;
  }

  // ai: check if we need to reply
  const result = await aiCheckIfNeedsReply({
    user,
    messages: threadMessages.map(getEmailForLLM),
  });

  // if yes, create a tracker
  if (result.needsReply) {
    await createReplyTrackerOutbound(userId, message.threadId, message.id);
  } else {
    console.log("No need to reply");
  }
}

async function createReplyTrackerOutbound(
  userId: string,
  threadId: string,
  messageId: string,
) {
  if (!threadId || !messageId) return;

  await prisma.threadTracker.upsert({
    where: {
      userId_threadId_messageId: {
        userId,
        threadId,
        messageId,
      },
    },
    update: {},
    create: {
      userId,
      threadId,
      messageId,
      type: ThreadTrackerType.AWAITING,
    },
  });
}

async function resolveReplyTrackers(userId: string, threadId: string) {
  await prisma.threadTracker.updateMany({
    where: {
      userId,
      threadId,
      resolved: false,
      type: ThreadTrackerType.NEEDS_REPLY,
    },
    data: {
      resolved: true,
    },
  });
}
