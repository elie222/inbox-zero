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

export async function processLabelRemoval(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    emailAccount,
    provider,
  }: {
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

    const labels = await provider.getLabels();

    const removedLabelNames = removedLabelIds
      .map((labelId: string) => {
        const label = labels.find((l) => l.id === labelId);
        return label?.name;
      })
      .filter(
        (labelName: string | null | undefined): labelName is string =>
          !!labelName && !SYSTEM_LABELS.includes(labelName),
      );

    await analyseLabelRemoval({
      labelNames: removedLabelNames,
      messageId,
      threadId,
      emailAccountId,
      parsedMessage,
      emailAccount,
    });
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
  labelNames,
  messageId,
  threadId,
  emailAccountId,
  parsedMessage,
  emailAccount,
}: {
  labelNames: string[];
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
      labelNames,
    });
    return;
  }

  if (labelNames.includes(inboxZeroLabels.cold_email.name)) {
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
  const matchedRules: {
    systemType: string;
    instructions: string | null;
    ruleName: string;
  }[] = [];

  // Only match rules created by the system
  for (const [systemType, data] of systemTypeData) {
    for (const labelName of labelNames) {
      if (data.labels.includes(labelName)) {
        matchedRules.push({
          systemType,
          instructions: data.instructions,
          ruleName: data.ruleName,
        });
        break;
      }
    }
  }

  if (matchedRules.length === 0) {
    logger.info(
      "No system rules found for label removal, skipping AI analysis",
      { emailAccountId, labelNames },
    );
    return;
  }

  // Matching rule by SystemType and not by name
  if (
    matchedRules.find(
      (matchedRule) => matchedRule.systemType === SystemType.NEWSLETTER,
    )
  ) {
    logger.info("Processing system rule label removal with AI analysis", {
      emailAccountId,
      labelNames,
      messageId,
    });

    try {
      const analysis = await aiAnalyzeLabelRemoval({
        matchedRules,
        email: getEmailForLLM(parsedMessage),
        emailAccount,
      });

      await processLabelRemovalAnalysis({
        analysis,
        emailAccountId,
        labelNames,
        matchedRules,
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
      labelNames,
    });
  }
}

export async function processLabelRemovalAnalysis({
  analysis,
  emailAccountId,
  labelNames,
  matchedRules,
}: {
  analysis: LabelRemovalAnalysis;
  emailAccountId: string;
  labelNames: string[];
  matchedRules: {
    systemType: string;
    instructions: string | null;
    ruleName: string;
  }[];
}): Promise<void> {
  if (analysis.patterns && analysis.patterns.length > 0) {
    const patternsToSave = analysis.patterns.map((pattern) => {
      return {
        type: pattern.type,
        value: pattern.value,
        exclude: pattern.exclude,
        reasoning: pattern.reasoning,
      };
    });

    // Apply patterns to all matched rules
    // More than one rule can match only if the same label is used for multiple system rules
    for (const rule of matchedRules) {
      logger.info("Adding learned patterns to rule", {
        emailAccountId,
        ruleName: rule.ruleName,
        patternCount: patternsToSave.length,
      });

      await saveLearnedPatterns({
        emailAccountId,
        ruleName: rule.ruleName,
        patterns: patternsToSave,
      });
    }
  } else {
    logger.info("No learned pattern inferred for this label removal", {
      emailAccountId,
      labelNames: labelNames.join(", "),
      ruleNames: matchedRules.map((r) => r.ruleName).join(", "),
    });
  }
}
