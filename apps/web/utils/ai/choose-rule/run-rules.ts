import { after } from "next/server";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  ActionType,
  ExecutedRuleStatus,
  SystemType,
  type Rule,
} from "@prisma/client";
import type { ActionItem } from "@/utils/ai/types";
import { findMatchingRules } from "@/utils/ai/choose-rule/match-rules";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { MatchReason } from "@/utils/ai/choose-rule/types";
import { serializeMatchReasons } from "@/utils/ai/choose-rule/types";
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
import {
  CONVERSATION_STATUS_TYPES,
  isConversationStatusType,
} from "@/utils/reply-tracker/conversation-status-config";
import {
  determineConversationStatus,
  updateThreadTrackers,
} from "@/utils/reply-tracker/handle-conversation-status";
import { removeConflictingThreadStatusLabels } from "@/utils/reply-tracker/label-helpers";
import { saveColdEmail } from "@/utils/cold-email/is-cold-email";
import { internalDateToDate } from "@/utils/date";
import { ConditionType } from "@/utils/config";

const logger = createScopedLogger("ai-run-rules");

export type RunRulesResult = {
  rule?: Pick<
    Rule,
    | "id"
    | "name"
    | "instructions"
    | "groupId"
    | "from"
    | "to"
    | "subject"
    | "body"
    | "conditionalOperator"
  > | null;
  actionItems?: ActionItem[];
  reason?: string | null;
  status: ExecutedRuleStatus;
  matchReasons?: MatchReason[];
  existing?: boolean;
  createdAt: Date;
};

export const CONVERSATION_TRACKING_META_RULE_ID = "conversation-tracking-meta";

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
  rules: RuleWithActions[];
  emailAccount: EmailAccountWithAI;
  isTest: boolean;
  modelType: ModelType;
}): Promise<RunRulesResult[]> {
  const batchTimestamp = new Date(); // Single timestamp for this batch execution
  const { regularRules, conversationRules } = prepareRulesWithMetaRule(rules);

  const results = await findMatchingRules({
    rules: regularRules,
    message,
    emailAccount,
    provider,
    modelType,
  });

  // Auto-reapply conversation tracking for thread continuity
  const conversationAwareMatches = await ensureConversationRuleContinuity({
    emailAccountId: emailAccount.id,
    threadId: message.threadId,
    conversationRules,
    regularRules,
    matches: results.matches,
  });

  const finalMatches = limitDraftEmailActions(conversationAwareMatches);

  logger.trace("Matching rule", () => ({
    results: finalMatches.map(filterNullProperties),
  }));

  if (!finalMatches.length) {
    const reason = results.reasoning || "No rules matched";
    if (!isTest) {
      await prisma.executedRule.create({
        data: {
          threadId: message.threadId,
          messageId: message.id,
          automated: true,
          reason,
          matchMetadata: undefined,
          status: ExecutedRuleStatus.SKIPPED,
          emailAccount: { connect: { id: emailAccount.id } },
        },
      });
    }

    return [
      {
        rule: null,
        reason,
        status: ExecutedRuleStatus.SKIPPED,
        createdAt: batchTimestamp,
      },
    ];
  }

  const executedRules: RunRulesResult[] = [];

  for (const result of finalMatches) {
    let ruleToExecute = result.rule;
    let reasonToUse = results.reasoning;

    if (result.rule && isConversationRule(result.rule.id)) {
      const { rule: statusRule, reason: statusReason } =
        await determineConversationStatus({
          conversationRules,
          message,
          emailAccount,
          provider,
          modelType,
        });

      if (!statusRule) {
        const executedRule: RunRulesResult = {
          rule: null,
          reason: statusReason || "No enabled conversation status rule found",
          createdAt: batchTimestamp,
          status: ExecutedRuleStatus.SKIPPED,
        };

        executedRules.push(executedRule);
        continue;
      }

      ruleToExecute = statusRule;
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
      batchTimestamp,
    );

    executedRules.push({
      ...executedRule,
      status: executedRule.executedRule?.status || ExecutedRuleStatus.APPLIED,
    });
  }

  return executedRules;
}

function prepareRulesWithMetaRule(rules: RuleWithActions[]): {
  regularRules: RuleWithActions[];
  conversationRules: RuleWithActions[];
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
      name: "Conversations",
      instructions: `Personal conversations and communication with real people. This covers all conversation states: emails you need to reply to, emails you're awaiting replies on, FYI updates from people, and resolved discussions.

Match when:
- Questions or requests for information/action
- Personal updates or FYI information from real people
- Follow-ups on ongoing conversations
- Conversations that have been resolved or concluded

EXCLUDE:
- All automated notifications (LinkedIn, GitHub, Slack, Figma, Jira, Facebook, social media platforms, marketing)
- System emails (order confirmations, receipts, calendar invites)

NOTE: When this rule matches, it should typically be the primary match.`,
      enabled: true,
      runOnThreads: true,
      systemType: null,
      actions: [],
    };

    regularRules.push(metaRule);
  }

  return { regularRules, conversationRules };
}

async function executeMatchedRule(
  rule: RuleWithActions,
  message: ParsedMessage,
  emailAccount: EmailAccountWithAI,
  client: EmailProvider,
  reason: string | undefined,
  matchReasons: MatchReason[] | undefined,
  isTest: boolean,
  modelType: ModelType,
  batchTimestamp: Date,
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
      createdAt: batchTimestamp,
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
      matchMetadata: serializeMatchReasons(matchReasons),
      rule: rule?.id ? { connect: { id: rule.id } } : undefined,
      emailAccount: { connect: { id: emailAccount.id } },
      createdAt: batchTimestamp, // Use batch timestamp for grouping
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
    await Promise.all([
      removeConflictingThreadStatusLabels({
        emailAccountId: emailAccount.id,
        threadId: message.threadId,
        systemType: rule.systemType,
        provider: client,
      }),
      updateThreadTrackers({
        emailAccountId: emailAccount.id,
        threadId: message.threadId,
        messageId: message.id,
        sentAt: internalDateToDate(message.internalDate),
        status: rule.systemType,
      }),
    ]);
  }

  if (executedRule) {
    if (delayedActions?.length > 0) {
      // Cancels existing scheduled actions to avoid duplicates
      await cancelScheduledActions({
        emailAccountId: emailAccount.id,
        messageId: message.id,
        threadId: message.threadId,
        ruleId: rule.id,
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
    createdAt: batchTimestamp,
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

  // Cold email blocker has its own AI analysis and stores senders in ColdEmail table
  // No need for learned pattern analysis
  if (result.rule.systemType === SystemType.COLD_EMAIL) return false;

  // skip if we already matched for static reasons
  // learnings only needed for rules that would run through an ai
  if (
    result.matchReasons?.some(
      (reason) =>
        reason.type === ConditionType.STATIC ||
        reason.type === ConditionType.LEARNED_PATTERN,
    )
  ) {
    return false;
  }

  return true;
}

/**
 * Checks if a conversation status rule was previously applied to any email in this thread.
 */
async function checkPreviousConversationRuleInThread({
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}): Promise<boolean> {
  const previousConversationRule = await prisma.executedRule.findFirst({
    where: {
      emailAccountId,
      threadId,
      status: ExecutedRuleStatus.APPLIED,
      rule: { systemType: { in: CONVERSATION_STATUS_TYPES } },
    },
    select: { id: true },
  });

  return !!previousConversationRule;
}

/**
 * Ensures conversation tracking continues throughout a thread.
 * If a conversation meta rule was previously applied to any email in this thread,
 * we automatically add it to matches even if the AI didn't select it.
 * This ensures conversation tracking continues consistently throughout the thread.
 *
 * Note: The meta rule is still passed to the AI (in regularRules), which may
 * influence it to select the rule naturally, but we enforce it regardless.
 *
 * Returns a new array of matches (does not mutate the input).
 *
 * @internal Exported for testing
 */
export async function ensureConversationRuleContinuity({
  emailAccountId,
  threadId,
  conversationRules,
  regularRules,
  matches,
}: {
  emailAccountId: string;
  threadId: string;
  conversationRules: RuleWithActions[];
  regularRules: RuleWithActions[];
  matches: { rule: RuleWithActions; matchReasons?: MatchReason[] }[];
}): Promise<{ rule: RuleWithActions; matchReasons?: MatchReason[] }[]> {
  if (conversationRules.length === 0) {
    return matches;
  }

  const hadConversationRuleInThread =
    await checkPreviousConversationRuleInThread({
      emailAccountId,
      threadId,
    });

  if (!hadConversationRuleInThread) {
    return matches;
  }

  const hasConversationMetaRuleInMatches = matches.some((match) =>
    isConversationRule(match.rule.id),
  );

  if (hasConversationMetaRuleInMatches) {
    return matches;
  }

  logger.info(
    "Automatically adding conversation meta rule due to previous application in thread",
  );

  // Find the meta rule in regularRules
  const metaRule = regularRules.find((r) => isConversationRule(r.id));

  if (!metaRule) {
    return matches;
  }

  return [
    ...matches,
    {
      rule: metaRule,
      matchReasons: [
        {
          type: ConditionType.STATIC,
        },
      ],
    },
  ];
}

function isConversationRule(ruleId: string): boolean {
  return ruleId === CONVERSATION_TRACKING_META_RULE_ID;
}

/**
 * Limits the number of draft email actions to a single selection.
 * If there are multiple draft email actions, we prefer static drafts (with fixed content)
 * over fully dynamic drafts (no fixed content). When multiple static drafts exist, we
 * select the first one encountered.
 * If there are no draft email actions, we return the matches as is.
 * If there is only one draft email action, we return the matches as is.
 */
export function limitDraftEmailActions(
  matches: {
    rule: RuleWithActions;
    matchReasons?: MatchReason[];
  }[],
): {
  rule: RuleWithActions;
  matchReasons?: MatchReason[];
}[] {
  const draftCandidates = matches.flatMap((match) =>
    match.rule.actions
      .filter((action) => action.type === ActionType.DRAFT_EMAIL)
      .map((action) => ({
        action,
        hasFixedContent: Boolean(action.content?.trim()),
      })),
  );

  if (draftCandidates.length <= 1) {
    return matches;
  }

  // Prefer static drafts (with fixed content) over fully dynamic drafts (no fixed content)
  // If multiple static drafts exist, use the first one encountered
  const preferredCandidate =
    draftCandidates.find((candidate) => candidate.hasFixedContent) ||
    draftCandidates[0];

  const selectedDraftId = preferredCandidate.action.id;

  logger.info("Limiting draft actions to a single selection", {
    selectedDraftId,
  });

  return matches.map((match) => {
    const hasExtraDrafts = match.rule.actions.some(
      (action) =>
        action.type === ActionType.DRAFT_EMAIL && action.id !== selectedDraftId,
    );

    if (!hasExtraDrafts) {
      return match;
    }

    return {
      ...match,
      rule: {
        ...match.rule,
        actions: match.rule.actions.filter(
          (action) =>
            action.type !== ActionType.DRAFT_EMAIL ||
            action.id === selectedDraftId,
        ),
      },
    };
  });
}
