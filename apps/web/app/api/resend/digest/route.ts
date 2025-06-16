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
import { getMessagesLargeBatch } from "@/utils/gmail/message";
import {
  digestCategorySchema,
  sendDigestEmailBody,
  type Digest,
  DigestEmailSummarySchema,
} from "./validation";
import { DigestStatus } from "@prisma/client";
import { extractNameFromEmail } from "../../../../utils/email";
import { RuleName } from "@/utils/rule/consts";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";

export const maxDuration = 60;

const logger = createScopedLogger("resend/digest");

type SendEmailResult = {
  success: boolean;
  message: string;
};

async function sendEmail({
  emailAccountId,
  force,
}: {
  emailAccountId: string;
  force?: boolean;
}): Promise<SendEmailResult> {
  const loggerOptions = { emailAccountId, force };
  logger.info("Sending digest email", loggerOptions);

  const emailAccount = await getEmailAccountWithAiAndTokens({ emailAccountId });

  if (!emailAccount) {
    throw new Error("Email account not found");
  }

  if (!emailAccount.tokens.access_token) {
    throw new Error("No access token available");
  }

  const gmail = await getGmailClientWithRefresh({
    accessToken: emailAccount.tokens.access_token,
    refreshToken: emailAccount.tokens.refresh_token,
    expiresAt: emailAccount.tokens.expires_at,
    emailAccountId,
  });

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

  // Return early if no digests were found
  if (pendingDigests.length === 0) {
    return { success: true, message: "No digests to process" };
  }

  // Store the digest IDs for the final update
  const processedDigestIds = pendingDigests.map((d) => d.id);

  const messageIds = pendingDigests.flatMap((digest) =>
    digest.items.map((item) => item.messageId),
  );

  const messages = await getMessagesLargeBatch({
    gmail,
    messageIds,
  });

  // Create a message lookup map for O(1) access
  const messageMap = new Map(messages.map((m) => [m.id, m]));

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

  // First, send the digest email and wait for it to complete
  await sendDigestEmail({
    from: env.RESEND_FROM_EMAIL,
    to: emailAccount.email,
    emailProps: {
      ...executedRulesByRule,
      baseUrl: env.NEXT_PUBLIC_BASE_URL,
      unsubscribeToken: token,
      date: new Date(),
    },
  });

  // Only update database if email sending succeeded
  await Promise.all([
    ...(emailAccount.digestScheduleId
      ? [
          prisma.schedule.update({
            where: {
              id: emailAccount.digestScheduleId,
              emailAccountId,
            },
            data: {
              lastOccurrenceAt: new Date(),
              nextOccurrenceAt: calculateNextFrequencyDate(
                emailAccount.digestSchedule!,
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

  return { success: true, message: "Digest email sent successfully" };
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
    const result = await sendEmail({ emailAccountId });
    return NextResponse.json(result);
  } catch (error) {
    logger.error("Error sending digest email", { error });
    captureException(error);
    return NextResponse.json(
      { success: false, error: "Error sending digest email" },
      { status: 500 },
    );
  }
});
