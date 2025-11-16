import { type NextRequest, NextResponse } from "next/server";
import { sendDigestEmail } from "@inboxzero/resend";
import { withEmailAccount, withError } from "@/utils/middleware";
import { env } from "@/env";
import { captureException, SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { calculateNextScheduleDate } from "@/utils/schedule";
import type { ParsedMessage } from "@/utils/types";
import {
  sendDigestEmailBody,
  storedDigestContentSchema,
  type Digest,
} from "./validation";
import { DigestStatus } from "@prisma/client";
import { extractNameFromEmail } from "../../../../utils/email";
import { getRuleName } from "@/utils/rule/consts";
import { SystemType } from "@prisma/client";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { camelCase } from "lodash";
import { createEmailProvider } from "@/utils/email/provider";
import { sleep } from "@/utils/sleep";

export const maxDuration = 60;

type SendEmailResult = {
  success: boolean;
  message: string;
};

export const GET = withEmailAccount("resend/digest", async (request) => {
  // send to self
  const emailAccountId = request.auth.emailAccountId;

  const logger = request.logger.with({
    force: true,
  });

  logger.info("Sending digest email to user GET");

  const result = await sendEmail({ emailAccountId, force: true, logger });

  return NextResponse.json(result);
});

export const POST = withError(
  verifySignatureAppRouter(async (request: NextRequest) => {
    const json = await request.json();
    const { success, data, error } = sendDigestEmailBody.safeParse(json);

    let logger = createScopedLogger("resend/digest");

    if (!success) {
      logger.error("Invalid request body", { error });
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const { emailAccountId } = data;

    logger = logger.with({ emailAccountId });

    logger.info("Sending digest email to user POST");

    try {
      const result = await sendEmail({ emailAccountId, logger });
      return NextResponse.json(result);
    } catch (error) {
      logger.error("Error sending digest email", { error });
      captureException(error);
      return NextResponse.json(
        { success: false, error: "Error sending digest email" },
        { status: 500 },
      );
    }
  }),
);

async function getDigestSchedule({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return prisma.schedule.findUnique({
    where: { emailAccountId },
    select: {
      id: true,
      intervalDays: true,
      occurrences: true,
      daysOfWeek: true,
      timeOfDay: true,
      lastOccurrenceAt: true,
      nextOccurrenceAt: true,
    },
  });
}

async function sendEmail({
  emailAccountId,
  force,
  logger,
}: {
  emailAccountId: string;
  force?: boolean;
  logger: Logger;
}): Promise<SendEmailResult> {
  logger.info("Sending digest email");

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      email: true,
      account: { select: { provider: true } },
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider: emailAccount.account.provider,
    logger,
  });

  const digestScheduleData = await getDigestSchedule({ emailAccountId });

  const pendingDigests = await prisma.digest.findMany({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    select: {
      id: true,
      items: {
        select: {
          messageId: true,
          content: true,
          action: {
            select: {
              executedRule: {
                select: {
                  rule: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (pendingDigests.length) {
    // Mark all found digests as processing
    await prisma.digest.updateMany({
      where: {
        id: {
          in: pendingDigests.map((d) => d.id),
        },
      },
      data: {
        status: DigestStatus.PROCESSING,
      },
    });
  }

  try {
    // Return early if no digests were found, unless force is true
    if (pendingDigests.length === 0) {
      if (!force) {
        return { success: true, message: "No digests to process" };
      }
      // When force is true, send an empty digest to indicate the system is working
      logger.info("Force sending empty digest", { emailAccountId });
    }

    // Store the digest IDs for the final update
    const processedDigestIds = pendingDigests.map((d) => d.id);

    const messageIds = pendingDigests.flatMap((digest) =>
      digest.items.map((item) => item.messageId),
    );

    logger.info("Fetching batch of messages");

    const messages: ParsedMessage[] = [];
    if (messageIds.length > 0) {
      const batchSize = 100;

      // Can't fetch more then 100 messages at a time, so fetch in batches
      // and wait 2 seconds to avoid rate limiting
      // TODO: Refactor into the provider if used elsewhere
      for (let i = 0; i < messageIds.length; i += batchSize) {
        const batch = messageIds.slice(i, i + batchSize);
        const batchResults = await emailProvider.getMessagesBatch(batch);
        messages.push(...batchResults);

        if (i + batchSize < messageIds.length) {
          await sleep(2000);
        }
      }
    }

    logger.info("Fetched batch of messages");

    // Create a message lookup map for O(1) access
    const messageMap = new Map(messages.map((m) => [m.id, m]));

    // Map of rules camelCase -> ruleName
    const ruleNameMap = new Map<string, string>();

    // Transform and group in a single pass
    const executedRulesByRule = pendingDigests.reduce((acc, digest) => {
      digest.items.forEach((item) => {
        const message = messageMap.get(item.messageId);
        if (!message) {
          logger.warn("Message not found, skipping digest item", {
            messageId: item.messageId,
          });
          return;
        }

        const ruleName =
          item.action?.executedRule?.rule?.name ||
          getRuleName(SystemType.COLD_EMAIL);

        const ruleNameKey = camelCase(ruleName);
        if (!ruleNameMap.has(ruleNameKey)) {
          ruleNameMap.set(ruleNameKey, ruleName);
        }

        if (!acc[ruleNameKey]) {
          acc[ruleNameKey] = [];
        }

        let parsedContent: unknown;
        try {
          parsedContent = JSON.parse(item.content);
        } catch (error) {
          logger.warn("Failed to parse digest item content, skipping item", {
            messageId: item.messageId,
            digestId: digest.id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
          return; // Skip this item and continue with the next one
        }

        const contentResult =
          storedDigestContentSchema.safeParse(parsedContent);

        if (contentResult.success) {
          acc[ruleNameKey].push({
            content: contentResult.data.content,
            from: extractNameFromEmail(message?.headers?.from || ""),
            subject: message?.headers?.subject || "",
          });
        } else {
          logger.warn("Failed to validate digest content structure", {
            messageId: item.messageId,
            digestId: digest.id,
            error: contentResult.error,
          });
        }
      });
      return acc;
    }, {} as Digest);

    if (Object.keys(executedRulesByRule).length === 0) {
      logger.info("No executed rules found, skipping digest email");
      return {
        success: true,
        message: "No executed rules found, skipping digest email",
      };
    }

    const token = await createUnsubscribeToken({ emailAccountId });

    logger.info("Sending digest email");

    // First, send the digest email and wait for it to complete
    await sendDigestEmail({
      from: env.RESEND_FROM_EMAIL,
      to: emailAccount.email,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        unsubscribeToken: token,
        date: new Date(),
        ruleNames: Object.fromEntries(ruleNameMap),
        ...executedRulesByRule,
        emailAccountId,
      },
    });

    logger.info("Digest email sent");

    // Only update database if email sending succeeded
    // Use a transaction to ensure atomicity - all updates succeed or none are applied
    await prisma.$transaction([
      ...(digestScheduleData
        ? [
            prisma.schedule.update({
              where: {
                id: digestScheduleData.id,
                emailAccountId,
              },
              data: {
                lastOccurrenceAt: new Date(),
                nextOccurrenceAt: calculateNextScheduleDate(digestScheduleData),
              },
            }),
          ]
        : []),
      // Mark only the processed digests as sent
      prisma.digest.updateMany({
        where: {
          id: {
            in: processedDigestIds,
          },
        },
        data: {
          status: DigestStatus.SENT,
          sentAt: new Date(),
        },
      }),
      // Redact all DigestItems for the processed digests
      prisma.digestItem.updateMany({
        data: { content: "[REDACTED]" },
        where: {
          digestId: {
            in: processedDigestIds,
          },
        },
      }),
    ]);
  } catch (error) {
    await prisma.digest.updateMany({
      where: {
        id: {
          in: pendingDigests.map((d) => d.id),
        },
      },
      data: {
        status: DigestStatus.FAILED,
      },
    });
    logger.error("Error sending digest email", { error });
    captureException(error);
    throw new SafeError("Error sending digest email", 500);
  }

  return { success: true, message: "Digest email sent successfully" };
}
