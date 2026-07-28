import { getConditionTypes, isAIRule } from "@/utils/condition";
import {
  findMatchingGroup,
  getGroupsWithRules,
  type GroupsWithRules,
} from "@/utils/group/find-matching-group";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import { LogicalOperator, SystemType } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import prisma from "@/utils/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type {
  MatchReason,
  MatchingRuleResult,
  PotentialAiMatchRule,
  RuleSelectionMetadata,
} from "@/utils/ai/choose-rule/types";
import { extractEmailAddress } from "@/utils/email";
import { isCalendarInvite } from "@/utils/parse/calender-event";
import type { EmailProvider } from "@/utils/email/types";
import type { ModelType } from "@/utils/llms/model";
import {
  getColdEmailRule,
  isColdEmailRuleEnabled,
} from "@/utils/cold-email/cold-email-rule";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import { getClassificationFeedback } from "@/utils/rule/classification-feedback";
import { isKnownContact } from "@/utils/contact/is-known-contact";
import {
  getSelectionMetadataTraceDetails,
  summarizeSelectionMetadata,
} from "@/utils/ai/choose-rule/selection-metadata-summary";
import { getStaticConditionFailures } from "@/utils/ai/choose-rule/match-static-conditions";
import {
  filterConversationStatusRulesWithMetadata,
  filterMultipleSystemRules,
  getPreviouslyExecutedRuleIds,
} from "@/utils/ai/choose-rule/filter-selectable-rules";
import {
  combineReasoning,
  getMatchesReasoning,
} from "@/utils/ai/choose-rule/match-reasons";

const MODULE = "match-rules";

type MatchingRulesResult = {
  matches: {
    rule: RuleWithActions;
    matchReasons?: MatchReason[];
  }[];
  reasoning: string;
  selectionMetadata: RuleSelectionMetadata;
};

export async function findMatchingRules({
  rules,
  message,
  emailAccount,
  provider,
  modelType,
  logger: log,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  modelType: ModelType;
  logger: Logger;
}): Promise<MatchingRulesResult> {
  const logger = log.with({ module: MODULE });
  const coldEmailRule = await getColdEmailRule(emailAccount.id);

  if (coldEmailRule && isColdEmailRuleEnabled(coldEmailRule)) {
    const coldEmailResult = await isColdEmail({
      email: getEmailForLLM(message),
      emailAccount,
      provider,
      modelType,
      coldEmailRule,
    });

    if (coldEmailResult.isColdEmail) {
      const coldRule = await prisma.rule.findUniqueOrThrow({
        where: { id: coldEmailRule.id },
        include: {
          actions: true,
        },
      });

      return {
        matches: [
          {
            rule: coldRule,
            matchReasons: coldEmailResult.patternMatch
              ? [
                  {
                    type: ConditionType.LEARNED_PATTERN,
                    group: coldEmailResult.patternMatch.group,
                    groupItem: coldEmailResult.patternMatch.groupItem,
                  },
                ]
              : [{ type: ConditionType.AI }],
          },
        ],
        reasoning: coldEmailResult.aiReason || coldEmailResult.reason,
        selectionMetadata: createRuleSelectionMetadata({
          isThread: provider.isReplyInThread(message),
        }),
      };
    }
  }

  // Filter out cold email rule which was already checked above
  const rulesWithoutColdEmail = rules.filter(
    (rule) => rule.systemType !== SystemType.COLD_EMAIL,
  );

  const results = await findMatchingRulesWithReasons(
    rulesWithoutColdEmail,
    message,
    emailAccount,
    provider,
    modelType,
    logger,
  );

  return results;
}

export function evaluateRuleConditions({
  rule,
  message,
  logger,
}: {
  rule: RuleWithActions;
  message: ParsedMessage;
  logger: Logger;
}): {
  matched: boolean;
  potentialAiMatch: boolean;
  matchReasons: MatchReason[];
  // The rule was dropped from selection because its static conditions
  // didn't match — surfaced so the drop is diagnosable, not silent
  staticFailed: boolean;
  // Which conditions rejected the email (e.g. `From: @gm.com`), so the
  // user sees what the rule requires without opening the editor
  failedStaticConditions: string[];
} {
  const { conditionalOperator: operator } = rule;
  const conditionTypes = getConditionTypes(rule);
  const hasAiCondition = conditionTypes.AI && isAIRule(rule);
  const hasStaticCondition = conditionTypes.STATIC;

  const matchReasons: MatchReason[] = [];

  // Check STATIC condition
  const staticResult = hasStaticCondition
    ? getStaticConditionFailures(rule, message, logger)
    : { matched: false, failedConditions: [] };
  const staticMatch = staticResult.matched;
  const failedStaticConditions = staticResult.failedConditions;
  if (staticMatch) {
    matchReasons.push({ type: ConditionType.STATIC });
  }

  // Determine result based on what we have
  if (operator === LogicalOperator.OR) {
    // OR logic
    if (staticMatch) {
      // Found a match, no need for AI
      return {
        matched: true,
        potentialAiMatch: false,
        matchReasons,
        staticFailed: false,
        failedStaticConditions,
      };
    }
    if (hasAiCondition) {
      // No static match, but have AI - need to check AI (the rule stays in
      // play, so a failed static leg isn't a drop)
      return {
        matched: false,
        potentialAiMatch: true,
        matchReasons,
        staticFailed: false,
        failedStaticConditions,
      };
    }
    // No conditions means no match
    return {
      matched: false,
      potentialAiMatch: false,
      matchReasons,
      staticFailed: hasStaticCondition && !staticMatch,
      failedStaticConditions,
    };
  } else {
    // AND logic
    if (hasStaticCondition && !staticMatch) {
      // Static failed, so AND fails
      return {
        matched: false,
        potentialAiMatch: false,
        matchReasons: [],
        staticFailed: true,
        failedStaticConditions,
      };
    }
    if (hasAiCondition) {
      // Static passed (or doesn't exist), but need AI to complete AND
      return {
        matched: false,
        potentialAiMatch: true,
        matchReasons,
        staticFailed: false,
        failedStaticConditions,
      };
    }
    // Only static (and it passed), or no conditions (no match)
    const matched = hasStaticCondition ? staticMatch : false;
    return {
      matched,
      potentialAiMatch: false,
      matchReasons,
      staticFailed: false,
      failedStaticConditions,
    };
  }
}

/**
 * Finds all rules that potentially match a message.
 *
 * Matching Logic:
 * 1. For rules with learned patterns (groups):
 *    - If pattern matches → add to matches and short-circuit (skip other checks for this rule)
 *    - If pattern doesn't match → continue to check static/AI conditions below
 *    - Note: Groups are independent of the AND/OR operator (which only applies to AI/Static conditions)
 *
 * 2. For all other rules (or group rules that didn't match via pattern):
 *    - Check static conditions (from, to, subject, body)
 *    - Check if AI instructions are present
 *    - Respect the conditional operator (AND/OR) between static and AI conditions
 *    - Add to matches if conditions match, or to potentialAiMatches if AI check is needed
 *
 * 3. Prioritization (at the end):
 *    - If ANY learned pattern matches were found → ignore all potentialAiMatches
 *    - This is an optimization: learned patterns are trusted and avoid expensive AI calls
 *    - Multiple learned pattern matches can be returned
 */
async function findPotentialMatchingRules({
  rules,
  message,
  isThread,
  provider,
  emailAccountId,
  logger,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  isThread: boolean;
  provider: EmailProvider;
  emailAccountId: string;
  logger: Logger;
}): Promise<MatchingRuleResult> {
  const matches: {
    rule: RuleWithActions;
    matchReasons: MatchReason[];
  }[] = [];
  const potentialAiMatches: PotentialAiMatchRule[] = [];
  const skippedThreadRuleNames: string[] = [];
  const continuedThreadRuleNames: string[] = [];
  const knownContactSkippedRuleNames: string[] = [];
  const staticFailedRuleNames: string[] = [];
  const learnedPatternExcludedRules: RuleSelectionMetadata["learnedPatternExcludedRules"] =
    [];

  const learnedPatternsLoader = new LearnedPatternsLoader();
  const previousRulesLoader = new PreviousThreadRulesLoader({
    emailAccountId,
    threadId: message.threadId,
  });
  const knownContactLoader = new KnownContactLoader({
    emailAccountId,
    from: message.headers.from,
  });

  // Go through all rules and collect matches and potential AI matches
  for (const rule of rules) {
    // Special case for calendar rules - only match with high-confidence signals
    const calendarMatch =
      rule.systemType === SystemType.CALENDAR && isCalendarInvite(message);

    if (calendarMatch) {
      matches.push({
        rule,
        matchReasons: [
          { type: ConditionType.PRESET, systemType: SystemType.CALENDAR },
        ],
      });
      // Don't continue - let it also be evaluated for AI matching below
    }

    // Skip rules with runOnThreads=false, unless this rule was previously applied in the thread
    // This ensures thread continuity (e.g., notifications continue to be labeled as notifications)
    // Must be checked before learned patterns to prevent pattern matches from bypassing this guard
    if (isThread && !rule.runOnThreads) {
      const previousRuleIds = await previousRulesLoader.getRuleIds();
      const wasPreviouslyApplied = previousRuleIds.has(rule.id);

      if (!wasPreviouslyApplied) {
        skippedThreadRuleNames.push(rule.name);
        continue;
      }

      continuedThreadRuleNames.push(rule.name);
    }

    // Rules can opt out of matching saved contacts entirely — checked
    // before learned patterns so nothing learned can override it
    if (rule.excludeKnownContacts) {
      const senderIsKnownContact = await knownContactLoader.isKnown();
      if (senderIsKnownContact) {
        logger.info("Skipping rule: sender is a known contact", {
          ruleName: rule.name,
        });
        knownContactSkippedRuleNames.push(rule.name);
        continue;
      }
    }

    // Learned patterns (groups)
    // Note: Groups are independent of the AND/OR operator (which only applies to AI/Static conditions)
    if (rule.groupId) {
      const groups = await learnedPatternsLoader.getGroups(rule.emailAccountId);
      if (groups?.length) {
        const { matchingItem, group, excludedItem, ruleExcluded } =
          matchesGroupRule(rule, groups, message);

        // If this rule is excluded by an exclusion pattern, skip it entirely
        if (ruleExcluded) {
          if (group && excludedItem) {
            learnedPatternExcludedRules.push({
              ruleId: rule.id,
              ruleName: rule.name,
              groupId: group.id,
              groupName: group.name,
              itemType: excludedItem.type,
              itemValue: excludedItem.value,
            });
          }
          continue;
        }

        if (matchingItem) {
          // Group matched - add to matches and skip other condition checks
          matches.push({
            rule,
            matchReasons: [
              {
                type: ConditionType.LEARNED_PATTERN,
                groupItem: matchingItem,
                group,
              },
            ],
          });
          continue;
        }
      }
    }

    // AI + Static conditions
    const {
      matched,
      potentialAiMatch,
      matchReasons,
      staticFailed,
      failedStaticConditions,
    } = evaluateRuleConditions({
      rule,
      message,
      logger,
    });

    if (matched) {
      matches.push({ rule, matchReasons });
    }

    if (staticFailed) {
      staticFailedRuleNames.push(
        failedStaticConditions.length
          ? `${rule.name} (requires ${failedStaticConditions.join("; ")})`
          : rule.name,
      );
    }

    if (potentialAiMatch) {
      potentialAiMatches.push({
        ...rule,
        instructions: rule.instructions ?? "",
        // Static outcomes survive to the final match record when the AI
        // confirms (an AND rule's static leg passed to get here)
        pendingMatchReasons: matchReasons,
        // Thread continuity is evidence the AI should see (the loader
        // memoizes, so this is one query per message)
        previouslyMatchedThread: isThread
          ? (await previousRulesLoader.getRuleIds()).has(rule.id)
          : false,
      });
    }
  }

  // TODO: move into loop for consistency?
  const conversationStatusFilter =
    await filterConversationStatusRulesWithMetadata(
      potentialAiMatches,
      message,
      provider,
      logger,
    );
  const filteredPotentialAiMatches = conversationStatusFilter.rules;

  const hasLearnedPatternMatch = matches.some((m) =>
    m.matchReasons.some((r) => r.type === ConditionType.LEARNED_PATTERN),
  );
  const remainingAiRuleNames = filteredPotentialAiMatches.map(
    (rule) => rule.name,
  );
  const selectionMetadata = createRuleSelectionMetadata({
    isThread,
    skippedThreadRuleNames,
    continuedThreadRuleNames,
    knownContactSkippedRuleNames,
    staticFailedRuleNames,
    learnedPatternExcludedRules,
    filteredConversationRuleNames: conversationStatusFilter.filteredRuleNames,
    conversationFilterReason: conversationStatusFilter.filterReason,
    remainingAiRuleNames,
  });

  if (
    potentialAiMatches.length ||
    skippedThreadRuleNames.length ||
    continuedThreadRuleNames.length ||
    learnedPatternExcludedRules.length ||
    conversationStatusFilter.filteredRuleNames.length ||
    !matches.length
  ) {
    const selectionMetadataSummary = summarizeSelectionMetadata([
      selectionMetadata,
    ]);

    logger.info("Built rule candidates", {
      isThread,
      matchedRuleCount: matches.length,
      matchedRuleNames: joinLogValues(matches.map((match) => match.rule.name)),
      potentialAiRuleCount: potentialAiMatches.length,
      potentialAiRuleNames: joinLogValues(
        potentialAiMatches.map((rule) => rule.name),
      ),
      skippedThreadRuleCount: skippedThreadRuleNames.length,
      skippedThreadRuleNames: joinLogValues(skippedThreadRuleNames),
      continuedThreadRuleCount: continuedThreadRuleNames.length,
      continuedThreadRuleNames: joinLogValues(continuedThreadRuleNames),
      knownContactSkippedRuleNames: joinLogValues(knownContactSkippedRuleNames),
      staticFailedRuleNames: joinLogValues(staticFailedRuleNames),
      learnedPatternExcludedRuleCount: learnedPatternExcludedRules.length,
      filteredConversationRuleCount:
        conversationStatusFilter.filteredRuleNames.length,
      filteredConversationRuleNames: joinLogValues(
        conversationStatusFilter.filteredRuleNames,
      ),
      conversationFilterReason: conversationStatusFilter.filterReason,
      remainingAiRuleCount: filteredPotentialAiMatches.length,
      remainingAiRuleNames: joinLogValues(remainingAiRuleNames),
      hasLearnedPatternMatch,
      learnedPatternExcludedRules:
        selectionMetadataSummary.learnedPatternExcludedRules,
    });

    logger.trace("Built rule candidate details", {
      ...getSelectionMetadataTraceDetails([selectionMetadata]),
    });
  }

  // If we have a learned pattern match, then return all matches and no potential AI matches
  // Learned patterns are used for efficiency to avoid running AI for every rule
  return {
    matches,
    potentialAiMatches: hasLearnedPatternMatch
      ? []
      : filteredPotentialAiMatches,
    selectionMetadata,
  };
}

async function findMatchingRulesWithReasons(
  rules: RuleWithActions[],
  message: ParsedMessage,
  emailAccount: EmailAccountWithAI,
  provider: EmailProvider,
  modelType: ModelType,
  logger: Logger,
): Promise<MatchingRulesResult> {
  const isThread = provider.isReplyInThread(message);

  const { matches, potentialAiMatches, selectionMetadata } =
    await findPotentialMatchingRules({
      rules,
      message,
      isThread,
      provider,
      emailAccountId: emailAccount.id,
      logger,
    });

  if (potentialAiMatches.length) {
    const senderEmail = extractEmailAddress(message.headers.from);
    const classificationFeedback = senderEmail
      ? await getClassificationFeedback({
          emailAccountId: emailAccount.id,
          senderEmail,
          provider,
          logger,
        })
      : null;

    const fullResult = await aiChooseRule({
      email: getEmailForLLM(message),
      rules: potentialAiMatches,
      emailAccount,
      modelType,
      logger,
      classificationFeedback,
    });

    const aiRules = filterMultipleSystemRules(fullResult.rules);

    return {
      matches: mergeMatchesWithAiResults(matches, aiRules),
      reasoning: combineReasoning(
        getMatchesReasoning(matches),
        fullResult.reason,
      ),
      selectionMetadata,
    };
  }

  return {
    matches,
    reasoning: getMatchesReasoning(matches),
    selectionMetadata,
  };
}

function mergeMatchesWithAiResults(
  matches: { rule: RuleWithActions; matchReasons?: MatchReason[] }[],
  aiRules: PotentialAiMatchRule[],
) {
  const aiRuleIds = new Set(aiRules.map((rule) => rule.id));
  const existingRuleIds = new Set(matches.map((match) => match.rule.id));

  return [
    ...matches.map((match) => ({
      rule: match.rule,
      matchReasons: aiRuleIds.has(match.rule.id)
        ? [...(match.matchReasons || []), { type: ConditionType.AI }]
        : match.matchReasons || [],
    })),
    ...aiRules
      .filter((rule) => !existingRuleIds.has(rule.id))
      .map((rule) => ({
        rule,
        // An AND rule reached the AI with its static leg already passed —
        // keep that in the record so history shows "static + AI", not AI
        matchReasons: [
          ...(rule.pendingMatchReasons ?? []),
          { type: ConditionType.AI },
        ],
      })),
  ];
}

function matchesGroupRule(
  rule: RuleWithActions,
  groups: GroupsWithRules,
  message: ParsedMessage,
) {
  const ruleGroup = groups.find((g) => g.id === rule.groupId);
  if (!ruleGroup)
    return {
      group: null,
      matchingItem: null,
      excludedItem: null,
      ruleExcluded: false,
    };

  const result = findMatchingGroup(message, ruleGroup);

  if (result.excluded) {
    return {
      group: result.group,
      matchingItem: null,
      excludedItem: result.excludedItem,
      ruleExcluded: true,
    };
  }

  if (result.matchingItem) {
    return {
      group: result.group,
      matchingItem: result.matchingItem,
      excludedItem: null,
      ruleExcluded: false,
    };
  }

  return {
    group: null,
    matchingItem: null,
    excludedItem: null,
    ruleExcluded: false,
  };
}

function createRuleSelectionMetadata({
  isThread,
  skippedThreadRuleNames = [],
  continuedThreadRuleNames = [],
  knownContactSkippedRuleNames = [],
  staticFailedRuleNames = [],
  learnedPatternExcludedRules = [],
  filteredConversationRuleNames = [],
  conversationFilterReason,
  remainingAiRuleNames = [],
}: {
  isThread: boolean;
  skippedThreadRuleNames?: string[];
  continuedThreadRuleNames?: string[];
  knownContactSkippedRuleNames?: string[];
  staticFailedRuleNames?: string[];
  learnedPatternExcludedRules?: RuleSelectionMetadata["learnedPatternExcludedRules"];
  filteredConversationRuleNames?: string[];
  conversationFilterReason?: string;
  remainingAiRuleNames?: string[];
}): RuleSelectionMetadata {
  return {
    isThread,
    skippedThreadRuleNames,
    continuedThreadRuleNames,
    knownContactSkippedRuleNames,
    staticFailedRuleNames,
    learnedPatternExcludedRules,
    filteredConversationRuleNames,
    conversationFilterReason,
    remainingAiRuleNames,
  };
}

function joinLogValues(values: (string | null | undefined)[]) {
  return values.filter((value): value is string => !!value).join(", ");
}

// Lazy load learned patterns when needed
class LearnedPatternsLoader {
  private groups?: GroupsWithRules | null;

  async getGroups(emailAccountId: string) {
    if (this.groups === undefined)
      this.groups = await getGroupsWithRules({ emailAccountId });
    return this.groups;
  }
}

// Lazy one-shot contact lookup: only queries when a rule opts out of
// known contacts, and at most once per message
class KnownContactLoader {
  private known?: boolean;
  private readonly emailAccountId: string;
  private readonly from: string;

  constructor({
    emailAccountId,
    from,
  }: {
    emailAccountId: string;
    from: string;
  }) {
    this.emailAccountId = emailAccountId;
    this.from = from;
  }

  async isKnown(): Promise<boolean> {
    if (this.known === undefined) {
      this.known = await isKnownContact({
        emailAccountId: this.emailAccountId,
        from: this.from,
      });
    }
    return this.known;
  }
}

// Lazy load previously executed rules in thread when needed
class PreviousThreadRulesLoader {
  private ruleIds?: Set<string>;
  private readonly emailAccountId: string;
  private readonly threadId: string;

  constructor({
    emailAccountId,
    threadId,
  }: {
    emailAccountId: string;
    threadId: string;
  }) {
    this.emailAccountId = emailAccountId;
    this.threadId = threadId;
  }

  async getRuleIds(): Promise<Set<string>> {
    if (this.ruleIds === undefined) {
      this.ruleIds = await getPreviouslyExecutedRuleIds({
        emailAccountId: this.emailAccountId,
        threadId: this.threadId,
      });
    }
    return this.ruleIds;
  }
}
