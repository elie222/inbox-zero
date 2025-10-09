import { after } from "next/server";
import type {
  ParsedMessage,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  ExecutedRuleStatus,
  SystemType,
  type Prisma,
  type Rule,
} from "@prisma/client";
import type { ActionItem } from "@/utils/ai/types";
import { findMatchingRule } from "@/utils/ai/choose-rule/match-rules";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createScopedLogger } from "@/utils/logger";
import type { MatchReason } from "@/utils/ai/choose-rule/types";
import { sanitizeActionFields } from "@/utils/action-item";
import { extractEmailAddress } from "@/utils/email";
import { filterNullProperties } from "@/utils";
import { analyzeSenderPattern } from "@/app/api/ai/analyze-sender-pattern/call-analyze-pattern-api";
import {
  scheduleDelayedActions,
  cancelScheduledActions,
} from "@/utils/scheduled-actions/scheduler";
import groupBy from "lodash/groupBy";
import type { EmailProvider } from "@/utils/email/types";
import type { ModelType } from "@/utils/llms/model";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import { determineConversationStatus } from "@/utils/reply-tracker/handle-conversation-status";

const logger = createScopedLogger("ai-run-rules");

export type RunRulesResult = {
  rule?: Rule | null;
  actionItems?: ActionItem[];
  reason?: string | null;
  matchReasons?: MatchReason[];
  existing?: boolean;
};

const CONVERSATION_TRACKING_META_RULE_ID = "conversation-tracking-meta";

export async function runRules({
  provider,
  message,
  rules,
  emailAccount,
  isTest,
  modelType,
}: {
  provider: EmailProvider;
  message: ParsedMessage;
  rules: RuleWithActionsAndCategories[];
  emailAccount: EmailAccountWithAI;
  isTest: boolean;
  modelType: ModelType;
}): Promise<RunRulesResult> {
  const { regularRules, conversationRules } = prepareRulesWithMetaRule(rules);

  const result = await findMatchingRule({
    rules: regularRules,
    message,
    emailAccount,
    provider,
    modelType,
  });

  analyzeSenderPatternIfAiMatch({
    isTest,
    result,
    message,
    emailAccountId: emailAccount.id,
  });

  logger.trace("Matching rule", () => ({
    result: filterNullProperties(result),
  }));

  if (result.rule) {
    let ruleToExecute = result.rule;
    let reasonToUse = result.reason;

    // Check if this is the conversation tracking meta-rule
    if (result.rule.id === CONVERSATION_TRACKING_META_RULE_ID) {
      // Determine which specific sub-rule applies
      const { specificRule, reason: statusReason } =
        await determineConversationStatus({
          conversationRules,
          message,
          emailAccount,
          provider,
          modelType,
        });

      if (!specificRule) {
        return {
          rule: null,
          reason: statusReason || "No enabled conversation status rule found",
        };
      }

      ruleToExecute = specificRule;
      reasonToUse = statusReason;
    }

    return await executeMatchedRule(
      ruleToExecute,
      message,
      emailAccount,
      provider,
      reasonToUse,
      result.matchReasons,
      isTest,
      modelType,
    );
  } else {
    await saveSkippedExecutedRule({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      reason: result.reason,
    });
  }
  return result;
}

function prepareRulesWithMetaRule(rules: RuleWithActionsAndCategories[]): {
  regularRules: RuleWithActionsAndCategories[];
  conversationRules: RuleWithActionsAndCategories[];
} {
  // Separate conversation status rules from regular rules
  const conversationRules = rules.filter((r) =>
    isConversationStatusType(r.systemType),
  );
  const regularRules = rules.filter(
    (r) => !isConversationStatusType(r.systemType),
  );

  // If any conversation status rules are enabled, create a meta-rule
  if (conversationRules.some((r) => r.enabled)) {
    const template = conversationRules[0];
    const metaRule = {
      ...template,
      id: CONVERSATION_TRACKING_META_RULE_ID,
      name: "Conversation Tracking",
      instructions:
        "Personal conversations with real people. Excludes automated notifications, newsletters, marketing, receipts, and calendar invites. Apply when the email is part of an actual conversation.",
      enabled: true,
      runOnThreads: true,
      actions: [],
      categoryFilters: [],
    };

    regularRules.push(metaRule);
  }

  return { regularRules, conversationRules };
}

async function executeMatchedRule(
  rule: RuleWithActionsAndCategories,
  message: ParsedMessage,
  emailAccount: EmailAccountWithAI,
  client: EmailProvider,
  reason: string | undefined,
  matchReasons: MatchReason[] | undefined,
  isTest: boolean,
  modelType: ModelType,
) {
  // get action items with args
  const actionItems = await getActionItemsWithAiArgs({
    message,
    emailAccount,
    selectedRule: rule,
    client,
    modelType,
  });

  if (!isTest) {
  }

  const { immediateActions, delayedActions } = groupBy(actionItems, (item) =>
    item.delayInMinutes != null && item.delayInMinutes > 0
      ? "delayedActions"
      : "immediateActions",
  );

  // handle action
  const executedRule = isTest
    ? undefined
    : await saveExecutedRule(
        {
          emailAccountId: emailAccount.id,
          threadId: message.threadId,
          messageId: message.id,
        },
        {
          rule,
          actionItems: immediateActions, // Only save immediate actions as ExecutedActions
          reason,
        },
      );

  if (executedRule && delayedActions?.length > 0 && !isTest) {
    // Attempts to cancel any existing scheduled actions to avoid duplicates
    await cancelScheduledActions({
      emailAccountId: emailAccount.id,
      messageId: message.id,
      threadId: message.threadId,
      reason: "Superseded by new rule execution",
    });
    await scheduleDelayedActions({
      executedRuleId: executedRule.id,
      actionItems: delayedActions,
      messageId: message.id,
      threadId: message.threadId,
      emailAccountId: emailAccount.id,
    });
  }

  // Execute immediate actions if any
  if (executedRule && immediateActions?.length > 0) {
    await executeAct({
      client,
      userEmail: emailAccount.email,
      userId: emailAccount.userId,
      emailAccountId: emailAccount.id,
      executedRule,
      message,
    });
  } else if (executedRule && !delayedActions?.length) {
    // No actions at all (neither immediate nor delayed), mark as applied
    await prisma.executedRule.update({
      where: { id: executedRule.id },
      data: { status: ExecutedRuleStatus.APPLIED },
    });
  }
  // Note: If there are ONLY delayed actions (no immediate), status stays APPLYING
  // and will be updated to APPLIED by checkAndCompleteExecutedRule() when scheduled actions finish

  return {
    rule,
    actionItems,
    executedRule,
    reason,
    matchReasons,
  };
}

async function saveSkippedExecutedRule({
  emailAccountId,
  threadId,
  messageId,
  reason,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  reason?: string;
}) {
  const data: Prisma.ExecutedRuleCreateInput = {
    threadId,
    messageId,
    automated: true,
    reason,
    status: ExecutedRuleStatus.SKIPPED,
    emailAccount: { connect: { id: emailAccountId } },
  };

  await upsertExecutedRule({
    emailAccountId,
    threadId,
    messageId,
    data,
  });
}

async function saveExecutedRule(
  {
    emailAccountId,
    threadId,
    messageId,
  }: {
    emailAccountId: string;
    threadId: string;
    messageId: string;
  },
  {
    rule,
    actionItems,
    reason,
  }: {
    rule: RuleWithActionsAndCategories;
    actionItems: ActionItem[];
    reason?: string;
  },
) {
  const data: Prisma.ExecutedRuleCreateInput = {
    actionItems: {
      createMany: {
        data:
          actionItems?.map((item) => {
            const { delayInMinutes: _delayInMinutes, ...executedActionFields } =
              sanitizeActionFields(item);
            return executedActionFields;
          }) || [],
      },
    },
    messageId,
    threadId,
    automated: true,
    status: ExecutedRuleStatus.APPLYING, // Changed from PENDING - rules are now always automated
    reason,
    rule: rule?.id ? { connect: { id: rule.id } } : undefined,
    emailAccount: { connect: { id: emailAccountId } },
  };

  return await upsertExecutedRule({
    emailAccountId,
    threadId,
    messageId,
    data,
  });
}

async function upsertExecutedRule({
  emailAccountId,
  threadId,
  messageId,
  data,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  data: Prisma.ExecutedRuleCreateInput;
}) {
  try {
    return await prisma.executedRule.upsert({
      where: {
        unique_emailAccount_thread_message: {
          emailAccountId,
          threadId,
          messageId,
        },
      },
      create: data,
      update: data.rule
        ? data
        : {
            ...data,
            rule: { disconnect: true },
          },
      include: { actionItems: true },
    });
  } catch (error) {
    if (isDuplicateError(error)) {
      // Unique constraint violation, ignore the error
      // May be due to a race condition?
      logger.info("Ignored duplicate entry for ExecutedRule", {
        emailAccountId,
        threadId,
        messageId,
      });
      return await prisma.executedRule.findUnique({
        where: {
          unique_emailAccount_thread_message: {
            emailAccountId,
            threadId,
            messageId,
          },
        },
        include: { actionItems: true },
      });
    }
    // Re-throw any other errors
    throw error;
  }
}

async function analyzeSenderPatternIfAiMatch({
  isTest,
  result,
  message,
  emailAccountId,
}: {
  isTest: boolean;
  result: { rule?: Rule | null; matchReasons?: MatchReason[] };
  message: ParsedMessage;
  emailAccountId: string;
}) {
  if (shouldAnalyzeSenderPattern({ isTest, result })) {
    const fromAddress = extractEmailAddress(message.headers.from);
    if (fromAddress) {
      after(() =>
        analyzeSenderPattern({
          emailAccountId,
          from: fromAddress,
        }),
      );
    }
  }
}

function shouldAnalyzeSenderPattern({
  isTest,
  result,
}: {
  isTest: boolean;
  result: { rule?: Rule | null; matchReasons?: MatchReason[] };
}) {
  if (isTest) return false;
  if (!result.rule) return false;
  if (result.rule.systemType === SystemType.TO_REPLY) return false;

  // skip if we already matched for static reasons
  // learnings only needed for rules that would run through an ai
  if (
    result.matchReasons?.some(
      (reason) =>
        reason.type === "STATIC" ||
        reason.type === "GROUP" ||
        reason.type === "CATEGORY",
    )
  )
    return false;
  return true;
}
