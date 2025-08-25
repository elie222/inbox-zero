import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ActionType, ColdEmailStatus, SystemType } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { inboxZeroLabels } from "@/utils/label";
import { GmailLabel } from "@/utils/gmail/label";
import { aiAnalyzeLabelRemoval } from "@/utils/ai/label-analysis/analyze-label-removal";
import { LabelRemovalAction } from "@/utils/ai/label-analysis/analyze-label-removal";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import type { LabelRemovalAnalysis } from "@/utils/ai/label-analysis/analyze-label-removal";

const logger = createScopedLogger("webhook-label-removal");

const SYSTEM_LABELS = [
  GmailLabel.INBOX,
  GmailLabel.SENT,
  GmailLabel.DRAFT,
  GmailLabel.SPAM,
  GmailLabel.TRASH,
  GmailLabel.IMPORTANT,
  GmailLabel.STARRED,
  GmailLabel.UNREAD,
];

export async function getSystemRuleLabels(
  emailAccountId: string,
): Promise<
  Map<
    string,
    { labels: string[]; instructions: string | null; ruleName: string }
  >
> {
  const actions = await prisma.action.findMany({
    where: {
      type: ActionType.LABEL,
      rule: {
        emailAccountId,
        systemType: {
          not: null,
        },
      },
    },
    select: {
      label: true,
      rule: {
        select: {
          name: true,
          systemType: true,
          instructions: true,
        },
      },
    },
  });

  const systemTypeData = new Map<
    string,
    { labels: string[]; instructions: string | null; ruleName: string }
  >();

  for (const action of actions) {
    if (action.label && action.rule?.systemType && action.rule?.name) {
      const systemType = action.rule.systemType;
      if (!systemTypeData.has(systemType)) {
        systemTypeData.set(systemType, {
          labels: [],
          instructions: action.rule.instructions,
          ruleName: action.rule.name,
        });
      }
      systemTypeData.get(systemType)!.labels.push(action.label);
    }
  }

  return systemTypeData;
}

export async function handleLabelRemovedEvent(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    gmail,
    emailAccount,
    provider,
  }: {
    gmail: gmail_v1.Gmail;
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
  },
) {
  return processLabelRemoval(message, { gmail, emailAccount, provider });
}

export async function processLabelRemoval(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    gmail,
    emailAccount,
    provider,
  }: {
    gmail: gmail_v1.Gmail;
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
  },
) {
  const messageId = message.message?.id;
  const threadId = message.message?.threadId;
  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  if (!messageId || !threadId) {
    logger.warn("Skipping label removal - missing messageId or threadId", {
      email: userEmail,
      messageId,
      threadId,
    });
    return;
  }

  logger.info("Processing label removal for learning", {
    email: userEmail,
    messageId,
    threadId,
  });

  try {
    const parsedMessage = await provider.getMessage(messageId);

    const removedLabelIds = message.labelIds || [];

    const labels = await gmail.users.labels.list({ userId: "me" });

    const removedLabelNames = removedLabelIds
      .map((labelId: string) => {
        const label = labels.data.labels?.find(
          (l: gmail_v1.Schema$Label) => l.id === labelId,
        );
        return label?.name;
      })
      .filter(
        (labelName: string | null | undefined): labelName is string =>
          !!labelName && !SYSTEM_LABELS.includes(labelName),
      );

    for (const labelName of removedLabelNames) {
      await analyseLabelRemoval({
        labelName,
        messageId,
        threadId,
        emailAccountId,
        parsedMessage,
        emailAccount,
      });
    }
  } catch (error) {
    logger.error("Error processing label removal", {
      error,
      email: userEmail,
      messageId,
      threadId,
    });
  }
}

async function analyseLabelRemoval({
  labelName,
  messageId,
  threadId,
  emailAccountId,
  parsedMessage,
  emailAccount,
}: {
  labelName: string;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  parsedMessage: ParsedMessage;
  emailAccount: EmailAccountWithAI;
}) {
  const sender = extractEmailAddress(parsedMessage.headers.from);

  // Can't learn patterns without knowing who to exclude
  if (!sender) {
    logger.info("No sender found, skipping learning", {
      emailAccountId,
      messageId,
      labelName,
    });
    return;
  }

  if (labelName === inboxZeroLabels.cold_email.name) {
    logger.info("Processing Cold Email label removal", {
      emailAccountId,
      messageId,
    });

    await prisma.coldEmail.upsert({
      where: {
        emailAccountId_fromEmail: {
          emailAccountId,
          fromEmail: sender,
        },
      },
      update: {
        status: ColdEmailStatus.USER_REJECTED_COLD,
      },
      create: {
        status: ColdEmailStatus.USER_REJECTED_COLD,
        fromEmail: sender,
        emailAccountId,
        messageId,
        threadId,
      },
    });

    return;
  }

  const systemTypeData = await getSystemRuleLabels(emailAccountId);
  let matchedRule: {
    systemType: string;
    instructions: string | null;
    ruleName: string;
  } | null = null;

  for (const [systemType, data] of systemTypeData) {
    if (data.labels.includes(labelName)) {
      matchedRule = {
        systemType,
        instructions: data.instructions,
        ruleName: data.ruleName,
      };
      break;
    }
  }

  if (!matchedRule) {
    logger.info(
      "No system rule found for label removal, skipping AI analysis",
      { emailAccountId, labelName },
    );
    return;
  }

  // Matching rule by SystemType and not by name
  if (matchedRule.systemType === SystemType.NEWSLETTER) {
    logger.info("Processing system rule label removal with AI analysis", {
      emailAccountId,
      labelName,
      systemType: matchedRule.systemType,
      messageId,
    });

    try {
      const analysis = await aiAnalyzeLabelRemoval({
        label: {
          name: labelName,
          instructions: matchedRule.instructions,
        },
        email: getEmailForLLM(parsedMessage),
        emailAccount,
      });

      await processLabelRemovalAnalysis({
        analysis,
        emailAccountId,
        labelName,
        ruleName: matchedRule.ruleName,
      });
    } catch (error) {
      logger.error("Error analyzing label removal with AI", {
        emailAccountId,
        error,
      });
    }
  } else {
    logger.info("System type not yet supported for AI analysis", {
      emailAccountId,
      labelName,
      systemType: matchedRule.systemType,
    });
  }
}

export async function processLabelRemovalAnalysis({
  analysis,
  emailAccountId,
  labelName,
  ruleName,
}: {
  analysis: LabelRemovalAnalysis;
  emailAccountId: string;
  labelName: string;
  ruleName: string;
}): Promise<void> {
  switch (analysis.action) {
    case LabelRemovalAction.EXCLUDE_PATTERN:
    case LabelRemovalAction.NOT_INCLUDE:
      if (analysis.patternType && analysis.patternValue) {
        const excludeValue =
          analysis.exclude ??
          analysis.action === LabelRemovalAction.EXCLUDE_PATTERN;

        logger.info("Adding learned pattern to rule", {
          emailAccountId,
          ruleName,
          action: analysis.action,
          patternType: analysis.patternType,
          patternValue: analysis.patternValue,
          exclude: excludeValue,
        });

        await saveLearnedPatterns({
          emailAccountId,
          ruleName,
          patterns: [
            {
              type: analysis.patternType,
              value: analysis.patternValue,
              exclude: excludeValue,
              reasoning: analysis.reasoning,
            },
          ],
        });
      }
      break;

    case LabelRemovalAction.NO_ACTION:
      logger.info("No learned pattern inferred for this label removal", {
        emailAccountId,
        labelName,
        ruleName,
      });
      break;
  }
}
