import { NextResponse } from "next/server";
import { subDays } from "date-fns/subDays";
import { subHours } from "date-fns/subHours";
import { sendSummaryEmail } from "@inboxzero/transactional-email";
import { withEmailAccount, withError } from "@/utils/middleware";
import { env } from "@/env";
import { isAuthorizedCronOrInternalRequest } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
  SystemType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { decodeSnippet } from "@/utils/gmail/decode";
import { createUnsubscribeToken } from "@/utils/unsubscribe";
import { extractEmailAddress } from "@/utils/email";
import { getEmailSearchUrl, getEmailUrlForMessage } from "@/utils/url";
import { sendSummaryEmailBody } from "./validation";
import { createEmailProvider } from "@/utils/email/provider";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import type { ParsedMessage } from "@/utils/types";
import {
  ARCHIVED_EMAIL_DISPLAY_LIMIT,
  buildArchivedEmailSummaryItems,
} from "./archived-emails";

export const maxDuration = 300;

const COLD_EMAIL_DISPLAY_LIMIT = 100;

export const GET = withEmailAccount("resend/summary", async (request) => {
  // send to self
  const emailAccountId = request.auth.emailAccountId;

  request.logger.info("Sending summary email to user GET", { emailAccountId });

  const result = await sendEmail({
    emailAccountId,
    force: true,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

export const POST = withError("resend/summary", async (request) => {
  const logger = request.logger;
  if (!isAuthorizedCronOrInternalRequest(request)) {
    logger.error("Unauthorized cron request");
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  const json = await request.json();
  const { success, data, error } = sendSummaryEmailBody.safeParse(json);

  if (!success) {
    logger.error("Invalid request body", { error });
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  }
  const { emailAccountId } = data;

  logger.info("Sending summary email to user POST", { emailAccountId });

  try {
    await sendEmail({ emailAccountId, logger });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error sending summary email", { error });
    captureException(error);
    return NextResponse.json(
      { success: false, error: "Error sending summary email" },
      { status: 500 },
    );
  }
});

async function sendEmail({
  emailAccountId,
  force,
  logger,
}: {
  emailAccountId: string;
  force?: boolean;
  logger: Logger;
}) {
  logger = logger.with({ emailAccountId, force });

  logger.info("Sending summary email");

  // Weekly, with 1 hour of slack so a run scheduled exactly 7 days after the
  // last send isn't skipped by small timing differences.
  const days = 7;
  const cutOffDate = subHours(new Date(), days * 24 - 1);

  if (!force) {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { lastSummaryEmailAt: true },
    });

    if (!emailAccount) {
      logger.error("Email account not found");
      return { success: true };
    }

    const lastSummaryEmailAt = emailAccount.lastSummaryEmailAt;

    if (lastSummaryEmailAt && lastSummaryEmailAt > cutOffDate) {
      logger.info("Last summary email was recent", {
        lastSummaryEmailAt,
        cutOffDate,
      });
      return { success: true };
    }
  }

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      userId: true,
      email: true,
      account: {
        select: {
          provider: true,
          refresh_token: true,
        },
      },
    },
  });

  if (!emailAccount) {
    logger.error("Email account not found");
    return { success: false };
  }

  logger = logger.with({ userId: emailAccount.userId });

  const coldEmailRule = await prisma.rule.findUnique({
    where: {
      emailAccountId_systemType: {
        emailAccountId,
        systemType: SystemType.COLD_EMAIL,
      },
    },
    select: { id: true },
  });

  const coldExecutedRuleWhere = coldEmailRule
    ? ({
        ruleId: coldEmailRule.id,
        automated: true,
        createdAt: { gt: cutOffDate },
      } satisfies Prisma.ExecutedRuleWhereInput)
    : null;

  const [
    coldEmailCount,
    coldExecutedRules,
    { count: archivedEmailCount, actions: archivedActions },
  ] = await Promise.all([
    coldExecutedRuleWhere
      ? prisma.executedRule.count({ where: coldExecutedRuleWhere })
      : Promise.resolve(0),
    coldExecutedRuleWhere
      ? prisma.executedRule.findMany({
          where: coldExecutedRuleWhere,
          orderBy: { createdAt: "desc" },
          take: COLD_EMAIL_DISPLAY_LIMIT,
          select: {
            messageId: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    getArchivedActions({ emailAccountId, cutOffDate }),
  ]);

  const messageIds = [
    ...coldExecutedRules.map((r) => r.messageId),
    ...archivedActions.map((a) => a.executedRule.messageId),
  ];

  logger.info("Getting messages", {
    messagesCount: messageIds.length,
  });

  const messages = await getMessages({
    emailAccountId,
    provider: emailAccount.account.provider,
    hasRefreshToken: !!emailAccount.account.refresh_token,
    messageIds,
    logger,
  });

  const messageMap = Object.fromEntries(
    messages.map((message) => [message.id, message]),
  );

  const getEmailLinks = (message: ParsedMessage) => {
    const senderAddress = extractEmailAddress(message.headers.from);
    return {
      url: getEmailUrlForMessage(
        message.id,
        message.threadId,
        emailAccount.email,
        emailAccount.account.provider,
      ),
      senderUrl: senderAddress
        ? getEmailSearchUrl(
            senderAddress,
            emailAccount.email,
            emailAccount.account.provider,
          )
        : undefined,
    };
  };

  const coldEmailers = coldExecutedRules.map((r) => {
    const message = messageMap[r.messageId];
    return {
      from: message?.headers.from || "Unknown",
      subject: decodeSnippet(message?.snippet) || "",
      sentAt: r.createdAt,
      ...(message ? getEmailLinks(message) : {}),
    };
  });

  const archivedEmails = buildArchivedEmailSummaryItems({
    archivedActions,
    messageMap,
    getEmailLinks,
  });

  const shouldSendEmail = !!(archivedEmailCount || coldEmailCount);

  logger.info("Sending summary email to user", {
    shouldSendEmail,
    archivedEmailCount,
    archivedEmailsShown: archivedEmails.length,
    coldEmailCount,
    coldEmailersShown: coldEmailers.length,
  });

  async function sendEmail({
    emailAccountId,
    userEmail,
  }: {
    emailAccountId: string;
    userEmail: string;
  }) {
    const token = await createUnsubscribeToken({ emailAccountId });

    return sendSummaryEmail({
      from: env.RESEND_FROM_EMAIL,
      to: userEmail,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
        archivedEmailCount,
        archivedEmails,
        coldEmailCount,
        coldEmailers,
        unsubscribeToken: token,
      },
    });
  }

  await Promise.all([
    shouldSendEmail
      ? sendEmail({ emailAccountId, userEmail: emailAccount.email })
      : Promise.resolve(),
    prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { lastSummaryEmailAt: new Date() },
    }),
  ]);

  return { success: true };
}

async function getMessages({
  emailAccountId,
  provider,
  hasRefreshToken,
  messageIds,
  logger,
}: {
  emailAccountId: string;
  provider: string;
  hasRefreshToken: boolean;
  messageIds: string[];
  logger: Logger;
}): Promise<ParsedMessage[]> {
  const uniqueMessageIds = Array.from(new Set(messageIds)).filter(Boolean);
  if (!uniqueMessageIds.length) return [];

  if (!hasRefreshToken) {
    logger.warn("Skipping summary message fetch: account has no refresh token");
    return [];
  }

  if (!isGoogleProvider(provider) && !isMicrosoftProvider(provider)) {
    logger.warn("Skipping summary message fetch: unsupported provider", {
      provider,
    });
    return [];
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  const messages: ParsedMessage[] = [];
  const batchSize = 100;

  for (let i = 0; i < uniqueMessageIds.length; i += batchSize) {
    const batch = uniqueMessageIds.slice(i, i + batchSize);
    messages.push(...(await emailProvider.getMessagesBatch(batch)));
  }

  return messages;
}

// Immediate and delayed archives are queried separately so each can start from
// an index; a single OR across the joined tables scans every ExecutedAction.
async function getArchivedActions({
  emailAccountId,
  cutOffDate,
}: {
  emailAccountId: string;
  cutOffDate: Date;
}) {
  const immediateWhere = {
    type: ActionType.ARCHIVE,
    createdAt: { gt: cutOffDate },
    scheduledAction: { is: null },
    executedRule: {
      emailAccountId,
      automated: true,
      status: ExecutedRuleStatus.APPLIED,
      // Immediate actions are created with their rule, but the rule's timestamp
      // is taken before AI processing, so allow it to trail the action.
      createdAt: { gt: subDays(cutOffDate, 1) },
    },
  } satisfies Prisma.ExecutedActionWhereInput;

  // Delayed actions are created when they run, possibly long after the rule,
  // so they are found through their scheduled action instead.
  const delayedWhere = {
    type: ActionType.ARCHIVE,
    createdAt: { gt: cutOffDate },
    scheduledAction: {
      is: {
        emailAccountId,
        status: ScheduledActionStatus.COMPLETED,
        executedAt: { gt: cutOffDate },
      },
    },
    executedRule: { emailAccountId, automated: true },
  } satisfies Prisma.ExecutedActionWhereInput;

  const findArchivedActions = (where: Prisma.ExecutedActionWhereInput) =>
    prisma.executedAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: ARCHIVED_EMAIL_DISPLAY_LIMIT,
      select: {
        id: true,
        createdAt: true,
        executedRule: {
          select: {
            messageId: true,
            rule: { select: { name: true, systemType: true } },
          },
        },
      },
    });

  const [immediateCount, delayedCount, immediateActions, delayedActions] =
    await Promise.all([
      prisma.executedAction.count({ where: immediateWhere }),
      prisma.executedAction.count({ where: delayedWhere }),
      findArchivedActions(immediateWhere),
      findArchivedActions(delayedWhere),
    ]);

  const actions = [...immediateActions, ...delayedActions]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, ARCHIVED_EMAIL_DISPLAY_LIMIT);

  return { count: immediateCount + delayedCount, actions };
}
