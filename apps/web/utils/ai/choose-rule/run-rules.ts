import { after } from "next/server";
import type {
  ParsedMessage,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { ExecutedRuleStatus, SystemType, type Rule } from "@prisma/client";
import type { ActionItem } from "@/utils/ai/types";
import { findMatchingRules } from "@/utils/ai/choose-rule/match-rules";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import prisma from "@/utils/prisma";
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
import {
  determineConversationStatus,
  updateThreadTrackers,
} from "@/utils/reply-tracker/handle-conversation-status";
import { saveColdEmail } from "@/utils/cold-email/is-cold-email";
import { internalDateToDate } from "@/utils/date";

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
}): Promise<RunRulesResult[]> {
  const { regularRules, conversationRules } = prepareRulesWithMetaRule(rules);

  const results = await findMatchingRules({
    rules: regularRules,
    message,
    emailAccount,
    provider,
    modelType,
  });

  logger.trace("Matching rule", () => ({
    results: results.map(filterNullProperties),
  }));

  if (!results.length) {
    const reason = "No rules matched"; // TODO: get the reason from the prompt?
    await prisma.executedRule.create({
      data: {
        threadId: message.threadId,
        messageId: message.id,
        automated: true,
        reason,
        status: ExecutedRuleStatus.SKIPPED,
        emailAccount: { connect: { id: emailAccount.id } },
      },
    });

    return [{ rule: null, reason }];
  }

  const executedRules: RunRulesResult[] = [];

  for (const result of results) {
    let ruleToExecute = result.rule;
    let reasonToUse = result.reason;

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
        const executedRule: RunRulesResult = {
          rule: null,
          reason: statusReason || "No enabled conversation status rule found",
        };

        executedRules.push(executedRule);
        continue;
      }

      ruleToExecute = specificRule;
      reasonToUse = statusReason;
    } else {
      analyzeSenderPatternIfAiMatch({
        isTest,
        result,
        message,
        emailAccountId: emailAccount.id,
      });
    }

    const executedRule = await executeMatchedRule(
      ruleToExecute,
      message,
      emailAccount,
      provider,
      reasonToUse,
      result.matchReasons,
      isTest,
      modelType,
    );

    executedRules.push(executedRule);
  }

  return executedRules;
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
        "Personal conversations and communication with real people (emails requiring response, FYI updates, discussions, etc). This is the PRIMARY rule for human-to-human email communication.",
      enabled: true,
      runOnThreads: true,
      systemType: null,
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
  const actionItems = await getActionItemsWithAiArgs({
    message,
    emailAccount,
    selectedRule: rule,
    client,
    modelType,
  });

  const { immediateActions, delayedActions } = groupBy(actionItems, (item) =>
    item.delayInMinutes != null && item.delayInMinutes > 0
      ? "delayedActions"
      : "immediateActions",
  );

  if (isTest) {
    return {
      rule,
      actionItems,
      executedRule: null,
      reason,
      matchReasons,
    };
  }

  const executedRule = await prisma.executedRule.create({
    data: {
      actionItems: {
        createMany: {
          data:
            // Only save immediate actions as ExecutedActions
            immediateActions?.map((item) => {
              const {
                delayInMinutes: _delayInMinutes,
                ...executedActionFields
              } = sanitizeActionFields(item);
              return executedActionFields;
            }) || [],
        },
      },
      messageId: message.id,
      threadId: message.threadId,
      automated: true,
      status: ExecutedRuleStatus.APPLYING, // Changed from PENDING - rules are now always automated
      reason,
      rule: rule?.id ? { connect: { id: rule.id } } : undefined,
      emailAccount: { connect: { id: emailAccount.id } },
    },
    include: { actionItems: true },
  });

  if (rule.systemType === SystemType.COLD_EMAIL) {
    await saveColdEmail({
      email: {
        id: message.id,
        threadId: message.threadId,
        from: message.headers.from,
      },
      emailAccount,
      aiReason: reason ?? null,
    });
  }

  if (isConversationStatusType(rule.systemType)) {
    await updateThreadTrackers({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      sentAt: internalDateToDate(message.internalDate),
      status: rule.systemType,
    });
  }

  if (executedRule) {
    if (delayedActions?.length > 0) {
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
    if (immediateActions?.length > 0) {
      await executeAct({
        client,
        userEmail: emailAccount.email,
        userId: emailAccount.userId,
        emailAccountId: emailAccount.id,
        executedRule,
        message,
      });
    } else if (!delayedActions?.length) {
      // No actions at all (neither immediate nor delayed), mark as applied
      await prisma.executedRule.update({
        where: { id: executedRule.id },
        data: { status: ExecutedRuleStatus.APPLIED },
      });
    }
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
  if (isConversationStatusType(result.rule.systemType)) return false;

  // skip if we already matched for static reasons
  // learnings only needed for rules that would run through an ai
  if (
    result.matchReasons?.some(
      (reason) =>
        reason.type === "STATIC" ||
        reason.type === "GROUP" ||
        reason.type === "CATEGORY",
    )
  ) {
    return false;
  }

  return true;
}
