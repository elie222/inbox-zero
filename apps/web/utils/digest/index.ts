import { env } from "@/env";
import { publishToQstashQueue } from "@/utils/upstash";
import { getCronSecretHeader } from "@/utils/cron";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { DigestBody } from "@/app/api/ai/digest/validation";

const logger = createScopedLogger("digest");

export async function enqueueDigestItem(
  message: any,
  emailAccountId: string,
  actionId: string,
) {
  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/ai/digest`;
  try {
    await publishToQstashQueue<DigestBody>({
      queueName: "digest-item-summarize",
      parallelism: 3, // Allow up to 3 concurrent jobs from this queue
      url,
      body: {
        emailAccountId,
        actionId,
        message: {
          messageId: message.messageId,
          threadId: message.threadId,
          from: message.from,
          to: message.to,
          subject: message.subject,
          content: message.content,
        },
      },
      headers: getCronSecretHeader(),
    });
  } catch (error) {
    logger.error("Failed to publish to Qstash", {
      emailAccountId,
      error,
    });
  }
}

async function findOldestUnsentDigest(emailAccountId: string) {
  return prisma.digest.findFirst({
    where: {
      emailAccountId,
      sent: false,
    },
    orderBy: {
      createdAt: "asc",
    },
  });
}

export async function upsertDigest({
  messageId,
  threadId,
  emailAccountId,
  actionId,
  summary,
}: {
  messageId: string;
  threadId: string;
  emailAccountId: string;
  actionId: string;
  summary: string;
}) {
  // First, find the oldest unsent digest or create a new one if none exist
  const oldestUnsentDigest = await findOldestUnsentDigest(emailAccountId);

  const digest =
    oldestUnsentDigest ||
    (await prisma.digest.create({
      data: {
        emailAccountId,
      },
    }));

  // Then, find or create the DigestItem
  const existingDigestItem = await prisma.digestItem.findFirst({
    where: {
      digestId: digest.id,
      messageId,
      threadId,
    },
  });

  if (existingDigestItem) {
    await prisma.digestItem.update({
      where: { id: existingDigestItem.id },
      data: {
        summary,
        actionId,
      },
    });
  } else {
    await prisma.digestItem.create({
      data: {
        messageId,
        threadId,
        summary,
        digestId: digest.id,
        actionId,
      },
    });
  }
}
