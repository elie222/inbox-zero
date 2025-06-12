import { NextResponse } from "next/server";
import { sendDigestEmail } from "@inboxzero/resend";
import { withEmailAccount, withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { camelCase } from "lodash";
import { calculateNextFrequencyDate } from "@/utils/frequency";
import { getGmailAndAccessTokenForEmail } from "@/utils/account";
import { getMessagesBatch, getMessagesLargeBatch } from "@/utils/gmail/message";
import {
  digestCategorySchema,
  sendDigestEmailBody,
  type Digest,
  digestSummarySchema,
  DigestEmailSummarySchema,
} from "./validation";
import { DigestStatus } from "@prisma/client";
import { extractNameFromEmail } from "../../../../utils/email";
import { RuleName } from "@/utils/rule/consts";

export const maxDuration = 60;

const logger = createScopedLogger("resend/digest");

async function sendEmail({
  emailAccountId,
  force,
}: {
  emailAccountId: string;
  force?: boolean;
}) {
  const loggerOptions = { emailAccountId, force };

  logger.info("Sending digest email", loggerOptions);

  const { accessToken } = await getGmailAndAccessTokenForEmail({
    emailAccountId,
  });

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    include: {
      digestFrequency: true,
    },
  });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  const digests = await prisma.$transaction(async (tx) => {
    const pendingDigests = await tx.digest.findMany({
      where: {
        emailAccountId,
        status: DigestStatus.PENDING,
      },
      include: {
        items: {
          include: {
            action: {
              include: {
                executedRule: {
                  include: {
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
      await tx.digest.updateMany({
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

    return pendingDigests;
  });

  // Return early if no digests were found
  if (digests.length === 0) {
    return new Response("No digests to process", { status: 200 });
  }

  // Store the digest IDs for the final update
  const processedDigestIds = digests.map((d) => d.id);

  const messages = await getMessagesLargeBatch({
    messageIds: digests.flatMap((digest) =>
      digest.items.map((item) => item.messageId),
    ),
    accessToken,
  });

  // Create a message lookup map for O(1) access
  const messageMap = new Map(messages.map((m) => [m.id, m]));

  // Transform and group in a single pass
  const executedRulesByRule = digests.reduce((acc, digest) => {
    digest.items.forEach((item) => {
      const message = messageMap.get(item.messageId);
      if (!message) {
        logger.warn("Message not found, skipping digest item", {
          messageId: item.messageId,
        });
        return;
      }

      const ruleName = camelCase(
        item.action?.executedRule?.rule?.name || RuleName.ColdEmail,
      );

      // Only include if it's one of our known categories
      const categoryResult = digestCategorySchema.safeParse(ruleName);
      if (categoryResult.success) {
        const category = categoryResult.data;
        if (!acc[category]) {
          acc[category] = [];
        }

        const parsedContent = JSON.parse(item.content);
        const contentResult = DigestEmailSummarySchema.safeParse(parsedContent);

        if (contentResult.success) {
          acc[category].push({
            content: {
              entries: contentResult.data?.entries || [],
              summary: contentResult.data?.summary,
            },
            from: extractNameFromEmail(message?.headers?.from || ""),
            subject: message?.headers?.subject || "",
          });
        }
      }
    });
    return acc;
  }, {} as Digest);

  const token = await createUnsubscribeToken({ emailAccountId });

  await Promise.all([
    sendDigestEmail({
      from: env.RESEND_FROM_EMAIL,
      to: emailAccount.email,
      emailProps: {
        ...executedRulesByRule,
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        unsubscribeToken: token,
        date: new Date(),
      },
    }),
    ...(emailAccount.digestFrequencyId
      ? [
          prisma.userFrequency.update({
            where: {
              id: emailAccount.digestFrequencyId,
              emailAccountId,
            },
            data: {
              lastOccurrenceAt: new Date(),
              nextOccurrenceAt: calculateNextFrequencyDate(
                emailAccount.digestFrequency!,
              ),
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

  return { success: true };
}

export const GET = withEmailAccount(async (request) => {
  // send to self
  const emailAccountId = request.auth.emailAccountId;

  logger.info("Sending digest email to user GET", { emailAccountId });

  const result = await sendEmail({ emailAccountId, force: true });

  return NextResponse.json(result);
});

export const POST = withError(async (request) => {
  if (!hasCronSecret(request)) {
    logger.error("Unauthorized cron request");
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const { success, data, error } = sendDigestEmailBody.safeParse(json);

  if (!success) {
    logger.error("Invalid request body", { error });
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const { emailAccountId } = data;

  logger.info("Sending digest email to user POST", { emailAccountId });

  try {
    await sendEmail({ emailAccountId });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error sending digest email", { error });
    captureException(error);
    return NextResponse.json(
      { success: false, error: "Error sending digest email" },
      { status: 500 },
    );
  }
});
