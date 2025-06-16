import { env } from "@/env";
import { publishToQstashQueue } from "@/utils/upstash";
import { getCronSecretHeader } from "@/utils/cron";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { DigestBody } from "@/app/api/ai/digest/validation";
import { DigestStatus } from "@prisma/client";
import type { DigestEmailSummarySchema } from "@/app/api/resend/digest/validation";
import type { EmailForAction } from "@/utils/ai/types";

const logger = createScopedLogger("digest");

export async function enqueueDigestItem({
  email,
  emailAccountId,
  actionId,
  coldEmailId,
}: {
  email: EmailForAction;
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
}) {
  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/ai/digest`;
  try {
    await publishToQstashQueue<DigestBody>({
      queueName: "digest-item-summarize",
      parallelism: 3, // Allow up to 3 concurrent jobs from this queue
      url,
      body: {
        emailAccountId,
        actionId,
        coldEmailId,
        message: {
          id: email.id,
          threadId: email.threadId,
          from: email.headers.from,
          to: email.headers.to,
          subject: email.headers.subject,
          content: email.textPlain || "",
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
  coldEmailId,
  content,
}: {
  messageId: string;
  threadId: string;
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
  content: DigestEmailSummarySchema;
}) {
  const logger = createScopedLogger("upsert-digest").with({
    messageId,
    threadId,
    emailAccountId,
    actionId,
    coldEmailId,
  });

  try {
    // Find or create the digest atomically
    const digest =
      (await prisma.digest.findFirst({
        where: {
          emailAccountId,
          status: DigestStatus.PENDING,
        },
        orderBy: {
          createdAt: "asc",
        },
      })) ||
      (await prisma.digest.create({
        data: {
          emailAccountId,
          status: DigestStatus.PENDING,
        },
      }));

    // Find or create the DigestItem atomically
    const digestItem = await prisma.digestItem.findFirst({
      where: {
        digestId: digest.id,
        messageId,
        threadId,
      },
    });

    const contentString = JSON.stringify(content);

    if (digestItem) {
      logger.info("Updating existing digest");
      await prisma.digestItem.update({
        where: { id: digestItem.id },
        data: {
          content: contentString,
          ...(actionId ? { actionId } : {}),
          ...(coldEmailId ? { coldEmailId } : {}),
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
          ...(actionId ? { actionId } : {}),
          ...(coldEmailId ? { coldEmailId } : {}),
        },
      });
    }
  } catch (error) {
    logger.error("Failed to upsert digest", { error });
    throw error;
  }
}
