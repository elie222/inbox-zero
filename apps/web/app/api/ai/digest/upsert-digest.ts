import { DigestStatus } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { StoredDigestContent } from "@/app/api/resend/digest/validation";

async function findPendingDigestWithItem(
  emailAccountId: string,
  messageId: string,
  threadId: string,
) {
  return await prisma.digest.findFirst({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      items: {
        where: { messageId, threadId },
        take: 1,
      },
    },
  });
}

async function findOrCreateDigest(
  emailAccountId: string,
  messageId: string,
  threadId: string,
) {
  const digestWithItem = await findPendingDigestWithItem(
    emailAccountId,
    messageId,
    threadId,
  );

  if (digestWithItem) {
    return digestWithItem;
  }

  try {
    return await prisma.digest.create({
      data: {
        emailAccountId,
        status: DigestStatus.PENDING,
      },
      include: {
        items: {
          where: { messageId, threadId },
          take: 1,
        },
      },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;

    const digestCreatedByConcurrentRequest = await findPendingDigestWithItem(
      emailAccountId,
      messageId,
      threadId,
    );

    if (!digestCreatedByConcurrentRequest) throw error;

    return digestCreatedByConcurrentRequest;
  }
}

async function updateDigestItem(
  itemId: string,
  contentString: string,
  actionId?: string,
) {
  return await prisma.digestItem.update({
    where: { id: itemId },
    data: {
      content: contentString,
      ...(actionId && { actionId }),
    },
  });
}

async function createDigestItem({
  digestId,
  messageId,
  threadId,
  contentString,
  actionId,
}: {
  digestId: string;
  messageId: string;
  threadId: string;
  contentString: string;
  actionId?: string;
}) {
  return await prisma.digestItem.upsert({
    where: {
      digestId_threadId_messageId: {
        digestId,
        threadId,
        messageId,
      },
    },
    update: {
      content: contentString,
      ...(actionId && { actionId }),
    },
    create: {
      messageId,
      threadId,
      content: contentString,
      digestId,
      ...(actionId && { actionId }),
    },
  });
}

export async function upsertDigest({
  messageId,
  threadId,
  emailAccountId,
  actionId,
  content,
  logger,
}: {
  messageId: string;
  threadId: string;
  emailAccountId: string;
  actionId?: string;
  content: StoredDigestContent;
  logger: Logger;
}) {
  try {
    const digest = await findOrCreateDigest(
      emailAccountId,
      messageId,
      threadId,
    );
    const existingItem = digest.items[0];
    const contentString = JSON.stringify(content);

    if (existingItem) {
      logger.info("Updating existing digest item");
      await updateDigestItem(existingItem.id, contentString, actionId);
    } else {
      logger.info("Creating new digest item");
      await createDigestItem({
        digestId: digest.id,
        messageId,
        threadId,
        contentString,
        actionId,
      });
    }
  } catch (error) {
    logger.error("Failed to upsert digest", { error });
    throw error;
  }
}
