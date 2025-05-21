import { env } from "@/env";
import { publishToQstashQueue } from "@/utils/upstash";
import { getCronSecretHeader } from "@/utils/cron";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { DigestBody } from "@/app/api/ai/digest/validation";
import { DigestStatus } from "@prisma/client";
import { type DigestEmailSummarySchema } from "@/app/api/resend/digest/validation";

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
      status: DigestStatus.PENDING,
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
  content,
}: {
  messageId: string;
  threadId: string;
  emailAccountId: string;
  actionId: string;
  content: DigestEmailSummarySchema;
}) {
  // First, find the oldest unsent digest or create a new one if none exist
  const oldestUnsentDigest = await findOldestUnsentDigest(emailAccountId);

  const digest =
    oldestUnsentDigest ||
    (await prisma.digest.create({
      data: {
        emailAccountId,
        status: DigestStatus.PENDING,
      },
    }));

  const logger = createScopedLogger("upsert-digest").with({
    messageId,
    threadId,
    emailAccountId,
    actionId,
  });

  try {
    // Then, find or create the DigestItem
    const existingDigestItem = await prisma.digestItem.findFirst({
      where: {
        digestId: digest.id,
        messageId,
        threadId,
      },
    });

    // Convert content to string
    const contentString = JSON.stringify(content);

    if (existingDigestItem) {
      logger.info("Updating existing digest");
      await prisma.digestItem.update({
        where: { id: existingDigestItem.id },
        data: {
          content: contentString,
          actionId,
        },
      });
    } else {
      logger.info("Creating new digest");
      await prisma.digestItem.create({
        data: {
          messageId,
          threadId,
          content: contentString,
          digestId: digest.id,
          actionId,
        },
      });
    }
  } catch (error) {
    logger.error("Failed to upsert digest", { error });
    throw error;
  }
}
