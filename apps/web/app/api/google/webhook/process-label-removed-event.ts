import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ActionType, ColdEmailStatus } from "@prisma/client";
import type { GroupItem } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import type { ParsedMessage } from "@/utils/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { inboxZeroLabels } from "@/utils/label";
import { GmailLabel } from "@/utils/gmail/label";
import { aiAnalyzeLabelRemoval } from "@/utils/ai/label-analysis/analyze-label-removal";

import {
  saveLearnedPatterns,
  removeLearnedPattern,
} from "@/utils/rule/learned-patterns";
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

async function findMatchingRuleWithLearnPatterns(
  emailAccountId: string,
  labelNames: string[],
): Promise<{
  systemType: string;
  instructions: string | null;
  ruleName: string;
  labelName: string;
  learnedPatterns: Pick<
    GroupItem,
    "type" | "value" | "exclude" | "reasoning"
  >[];
} | null> {
  const systemTypeData = await getSystemRuleLabels(emailAccountId);

  for (const [systemType, data] of systemTypeData) {
    for (const labelName of labelNames) {
      if (data.labels.includes(labelName)) {
        const learnedPatterns = await getLearnedPatternsForRule(
          emailAccountId,
          data.ruleName,
        );
        return {
          systemType,
          instructions: data.instructions,
          ruleName: data.ruleName,
          labelName,
          learnedPatterns,
        };
      }
    }
  }
  return null;
}

async function getLearnedPatternsForRule(
  emailAccountId: string,
  ruleName: string,
): Promise<Pick<GroupItem, "type" | "value" | "exclude" | "reasoning">[]> {
  const rule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      name: ruleName,
    },
    select: {
      group: {
        select: {
          items: {
            select: {
              type: true,
              value: true,
              exclude: true,
              reasoning: true,
            },
          },
        },
      },
    },
  });

  return rule?.group?.items || [];
}

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

  const matchedRule = await findMatchingRuleWithLearnPatterns(
    emailAccountId,
    labelNames,
  );

  if (!matchedRule) {
    logger.info(
      "No system rules found for label removal, skipping AI analysis",
      { emailAccountId, matchedRule },
    );
    return;
  }

  logger.info("Processing system rule label removal with AI analysis", {
    emailAccountId,
    messageId,
  });

  try {
    const analysis = await aiAnalyzeLabelRemoval({
      matchedRule,
      email: getEmailForLLM(parsedMessage),
      emailAccount,
    });

    await processLabelRemovalAnalysis({
      analysis,
      emailAccountId,
      matchedRule,
    });
  } catch (error) {
    logger.error("Error analyzing label removal with AI", {
      emailAccountId,
      error,
    });
  }
}

export async function processLabelRemovalAnalysis({
  analysis,
  emailAccountId,
  matchedRule,
}: {
  analysis: LabelRemovalAnalysis;
  emailAccountId: string;
  matchedRule: {
    systemType: string;
    instructions: string | null;
    ruleName: string;
    labelName: string;
  };
}): Promise<void> {
  if (analysis.action === "NO_ACTION") {
    logger.info("No action needed for this label removal", {
      emailAccountId,
      matchedRule,
    });
    return;
  }

  if (analysis.action === "REMOVE" && analysis.pattern) {
    logger.info("Removing learned pattern from rule", {
      emailAccountId,
      ruleName: matchedRule.ruleName,
      patternType: analysis.pattern.type,
      patternValue: analysis.pattern.value,
    });

    const result = await removeLearnedPattern({
      emailAccountId,
      ruleName: matchedRule.ruleName,
      pattern: {
        type: analysis.pattern.type,
        value: analysis.pattern.value,
      },
    });

    if (result.error) {
      logger.error("Failed to remove learned pattern", {
        emailAccountId,
        ruleName: matchedRule.ruleName,
        error: result.error,
      });
    } else {
      logger.info("Successfully removed learned pattern", {
        emailAccountId,
        ruleName: matchedRule.ruleName,
        patternType: analysis.pattern.type,
        patternValue: analysis.pattern.value,
      });
    }
    return;
  }

  if (analysis.action === "EXCLUDE" && analysis.pattern) {
    const patternToSave = {
      type: analysis.pattern.type,
      value: analysis.pattern.value,
      exclude: analysis.pattern.exclude,
      reasoning: analysis.pattern.reasoning,
    };

    logger.info("Adding learned pattern to rule", {
      emailAccountId,
      ruleName: matchedRule.ruleName,
      patternType: patternToSave.type,
      patternValue: patternToSave.value,
      exclude: patternToSave.exclude,
    });

    await saveLearnedPatterns({
      emailAccountId,
      ruleName: matchedRule.ruleName,
      patterns: [patternToSave],
    });
  }
}
