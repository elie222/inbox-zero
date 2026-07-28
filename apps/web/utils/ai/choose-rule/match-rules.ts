import { getConditionTypes, isAIRule } from "@/utils/condition";
import {
  findMatchingGroup,
  getGroupsWithRules,
  type GroupsWithRules,
} from "@/utils/group/find-matching-group";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import {
  ExecutedRuleStatus,
  LogicalOperator,
  SubjectMatchMode,
  SystemType,
} from "@/generated/prisma/enums";
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
import {
  extractEmailAddress,
  extractEmailAddresses,
  extractNameFromEmail,
  splitRecipientList,
} from "@/utils/email";
import { isCalendarInvite } from "@/utils/parse/calender-event";
import { checkSenderReplyHistory } from "@/utils/reply-tracker/check-sender-reply-history";
import {
  isAddressLikeEmailPattern,
  splitEmailPatterns,
} from "@/utils/rule/email-from-pattern";
import type { EmailProvider } from "@/utils/email/types";
import type { ModelType } from "@/utils/llms/model";
import {
  getColdEmailRule,
  isColdEmailRuleEnabled,
} from "@/utils/cold-email/cold-email-rule";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import { getClassificationFeedback } from "@/utils/rule/classification-feedback";
import { isKnownContact } from "@/utils/contact/is-known-contact";
import {
  getSelectionMetadataTraceDetails,
  summarizeSelectionMetadata,
} from "@/utils/ai/choose-rule/selection-metadata-summary";

const MODULE = "match-rules";

const TO_REPLY_RECEIVED_THRESHOLD = 10;
const NO_REPLY_PREFIXES = [
  "noreply@",
  "no-reply@",
  "notifications@",
  "notif@",
  "info@",
  "newsletter@",
  "updates@",
  "account@",
];

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

// Lazy load learned patterns when needed
class LearnedPatternsLoader {
  private groups?: GroupsWithRules | null;

  async getGroups(emailAccountId: string) {
    if (this.groups === undefined)
      this.groups = await getGroupsWithRules({ emailAccountId });
    return this.groups;
  }
}

// Lazy load previously executed rules in thread when needed
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

function getMatchReason(matchReasons?: MatchReason[]): string | undefined {
  if (!matchReasons || matchReasons.length === 0) return;

  return matchReasons
    .map((reason) => {
      switch (reason.type) {
        case ConditionType.STATIC:
          return "Matched static conditions";
        case ConditionType.LEARNED_PATTERN:
          return `Matched learned pattern: "${reason.groupItem.type}: ${reason.groupItem.value}"`;
        case ConditionType.PRESET:
          return "Matched a system preset";
        case ConditionType.AI:
          return "Matched via AI";
      }
    })
    .join(", ");
}

function joinLogValues(values: (string | null | undefined)[]) {
  return values.filter((value): value is string => !!value).join(", ");
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

function getMatchesReasoning(
  matches: { matchReasons?: MatchReason[] }[],
): string {
  return matches
    .map((match) => getMatchReason(match.matchReasons))
    .filter((reason): reason is string => !!reason)
    .join(", ");
}

function combineReasoning(...reasons: (string | undefined)[]) {
  return reasons
    .map((reason) => reason?.trim())
    .filter((reason): reason is string => !!reason)
    .join("; ");
}

export function matchesStaticRule(
  rule: Pick<RuleWithActions, "from" | "to" | "subject" | "body"> & {
    subjectMatchMode?: SubjectMatchMode | null;
    fromExclude?: boolean;
    toExclude?: boolean;
    subjectExclude?: boolean;
  },
  message: ParsedMessage,
  logger: Logger,
) {
  return getStaticConditionFailures(rule, message, logger).matched;
}

// Per-field results so a failed rule can say WHICH condition rejected the
// email and what that condition requires — "conditions didn't match" alone
// sends the user hunting through the rule editor blind
export function getStaticConditionFailures(
  rule: Pick<RuleWithActions, "from" | "to" | "subject" | "body"> & {
    subjectMatchMode?: SubjectMatchMode | null;
    fromExclude?: boolean;
    toExclude?: boolean;
    subjectExclude?: boolean;
  },
  message: ParsedMessage,
  logger: Logger,
): { matched: boolean; failedConditions: string[] } {
  const log = logger.with({ module: MODULE });
  const { from, to, subject, body } = rule;

  if (!from && !to && !subject && !body)
    return { matched: false, failedConditions: [] };

  const {
    fromAddressHeader,
    toAddressHeader,
    fromDisplayNameHeader,
    toDisplayNameHeader,
  } = getNormalizedEmailMatchHeaders(message);

  const failedConditions: string[] = [];

  const fromPatternMatch = from
    ? matchesEmailFieldPattern({
        pattern: from,
        addressText: fromAddressHeader.toLowerCase(),
        displayNameText: fromDisplayNameHeader.toLowerCase(),
        logInvalidPattern: (pattern, error) =>
          logInvalidEmailMatchPattern({
            logger: log,
            pattern,
            error,
          }),
      })
    : true;
  // An excluded condition matches when the pattern does NOT match
  const fromMatch = from
    ? rule.fromExclude
      ? !fromPatternMatch
      : fromPatternMatch
    : true;
  if (!fromMatch && from) {
    failedConditions.push(
      rule.fromExclude ? `Not From: ${from}` : `From: ${from}`,
    );
  }

  const toPatternMatch = to
    ? matchesEmailFieldPattern({
        pattern: to,
        addressText: toAddressHeader.toLowerCase(),
        displayNameText: toDisplayNameHeader.toLowerCase(),
        logInvalidPattern: (pattern, error) =>
          logInvalidEmailMatchPattern({
            logger: log,
            pattern,
            error,
          }),
      })
    : true;
  const toMatch = to
    ? rule.toExclude
      ? !toPatternMatch
      : toPatternMatch
    : true;
  if (!toMatch && to) {
    failedConditions.push(rule.toExclude ? `Not To: ${to}` : `To: ${to}`);
  }

  const subjectPatternMatch = subject
    ? matchesSubjectPattern(subject, message.headers.subject, log, {
        anchorStart: rule.subjectMatchMode === SubjectMatchMode.STARTS_WITH,
      })
    : true;
  const subjectMatch = subject
    ? rule.subjectExclude
      ? !subjectPatternMatch
      : subjectPatternMatch
    : true;
  if (!subjectMatch && subject) {
    failedConditions.push(
      rule.subjectExclude
        ? `Not Subject: "${subject}"`
        : `Subject: "${subject}"`,
    );
  }

  const bodyMatch = body
    ? matchesTextPattern(body, message.textPlain || "", log)
    : true;
  if (!bodyMatch && body) failedConditions.push(`Body: "${body}"`);

  return {
    matched: fromMatch && toMatch && subjectMatch && bodyMatch,
    failedConditions,
  };
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

export async function filterConversationStatusRules<
  T extends { id: string; name: string; systemType: SystemType | null },
>(
  potentialMatches: T[],
  message: ParsedMessage,
  provider: EmailProvider,
  logger: Logger,
): Promise<T[]> {
  const result = await filterConversationStatusRulesWithMetadata(
    potentialMatches,
    message,
    provider,
    logger,
  );

  return result.rules;
}

async function filterConversationStatusRulesWithMetadata<
  T extends { id: string; name: string; systemType: SystemType | null },
>(
  potentialMatches: T[],
  message: ParsedMessage,
  provider: EmailProvider,
  logger: Logger,
): Promise<{
  rules: T[];
  filteredRuleNames: string[];
  filterReason?: "no_reply_sender" | "reply_history_threshold";
}> {
  const log = logger.with({ module: MODULE });
  const toReplyRule = potentialMatches.find(
    (r) => r.systemType === SystemType.TO_REPLY,
  );

  if (!toReplyRule) {
    return { rules: potentialMatches, filteredRuleNames: [] };
  }

  const senderEmail = message.headers.from;
  if (!senderEmail) {
    return { rules: potentialMatches, filteredRuleNames: [] };
  }

  const extractedSenderEmail = extractEmailAddress(senderEmail);

  const filteredConversationRuleNames = potentialMatches
    .filter((r) => isConversationStatusType(r.systemType))
    .map((r) => r.name);

  function filteredOutConversationStatusRules() {
    return potentialMatches.filter(
      (r) => !isConversationStatusType(r.systemType),
    );
  }

  if (
    NO_REPLY_PREFIXES.some((prefix) => extractedSenderEmail.startsWith(prefix))
  ) {
    return {
      rules: filteredOutConversationStatusRules(),
      filteredRuleNames: filteredConversationRuleNames,
      filterReason: "no_reply_sender",
    };
  }

  try {
    const { hasReplied, receivedCount } = await checkSenderReplyHistory(
      provider,
      senderEmail,
      TO_REPLY_RECEIVED_THRESHOLD,
    );

    if (!hasReplied && receivedCount >= TO_REPLY_RECEIVED_THRESHOLD) {
      log.info(
        "Filtering out TO_REPLY rule due to no prior reply and high received count",
        {
          ruleId: toReplyRule.id,
          senderEmail,
          receivedCount,
        },
      );
      return {
        rules: filteredOutConversationStatusRules(),
        filteredRuleNames: filteredConversationRuleNames,
        filterReason: "reply_history_threshold",
      };
    }
  } catch (error) {
    log.error("Error checking reply history for TO_REPLY filter", {
      senderEmail,
      error,
    });
  }

  return { rules: potentialMatches, filteredRuleNames: [] };
}

/**
 * Filter system rules: if multiple system rules were matched, only keep the primary one.
 * Always keep all conversation rules (non-system rules).
 */
export function filterMultipleSystemRules<
  T extends { name: string; instructions: string; systemType?: string | null },
>(selectedRules: { rule: T; isPrimary?: boolean }[]): T[] {
  const systemRules = selectedRules.filter((r) => r.rule?.systemType);
  const conversationRules = selectedRules.filter(
    (r) => r.rule && !r.rule?.systemType,
  );

  let filteredSystemRules = systemRules;
  if (systemRules.length > 1) {
    // Only keep the primary system rule
    const primarySystemRule = systemRules.find((r) => r.isPrimary);
    filteredSystemRules = primarySystemRule ? [primarySystemRule] : systemRules;
  }

  return [...filteredSystemRules, ...conversationRules].map((r) => r.rule);
}

/**
 * Gets the IDs of rules that were previously executed in this thread.
 * This allows us to continue applying the same rules to a thread for consistency,
 * even if `runOnThreads` is false.
 */
async function getPreviouslyExecutedRuleIds({
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}): Promise<Set<string>> {
  const previousRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId,
      status: ExecutedRuleStatus.APPLIED,
      ruleId: { not: null },
    },
    select: { ruleId: true },
    distinct: ["ruleId"],
  });

  return new Set(
    previousRules.map((r) => r.ruleId).filter((id): id is string => !!id),
  );
}

function normalizeEmailHeaderForRuleMatching(
  header: string,
  allowMultiple = false,
) {
  if (!header) return "";

  if (allowMultiple) {
    return extractEmailAddresses(header).join(", ");
  }

  return extractEmailAddress(header);
}

function getNormalizedEmailMatchHeaders(message: ParsedMessage) {
  return {
    fromAddressHeader: normalizeEmailHeaderForRuleMatching(
      message.headers.from,
    ),
    toAddressHeader: normalizeEmailHeaderForRuleMatching(
      message.headers.to,
      true,
    ),
    fromDisplayNameHeader: normalizeEmailDisplayNameHeaderForRuleMatching(
      message.headers.from,
    ),
    toDisplayNameHeader: normalizeEmailDisplayNameHeaderForRuleMatching(
      message.headers.to,
    ),
  };
}

function normalizeEmailDisplayNameHeaderForRuleMatching(header: string) {
  if (!header) return "";

  return splitRecipientList(header)
    .map((part) => {
      const name = extractNameFromEmail(part).trim();
      const email = extractEmailAddress(part).trim().toLowerCase();

      if (!name) return "";
      if (email && name.toLowerCase() === email) return "";

      return name;
    })
    .filter(Boolean)
    .join(", ");
}

function matchesTextPattern(
  pattern: string,
  text: string,
  logger: Logger,
  options?: { anchorStart?: boolean },
) {
  try {
    return matchesRulePattern(pattern, text, options?.anchorStart);
  } catch (error) {
    logger.error("Invalid regex pattern", { pattern, error });
    return false;
  }
}

// Stacked reply/forward markers mailers prepend: "Re:", "RE: RE:", "Fwd:",
// "Fw:", "Re[2]:" — a subject rule describes the conversation topic, so
// replies must keep matching it (a "starts with Daily Report" rule has to
// catch "Re: Daily Report")
const REPLY_PREFIX_REGEX = /^(?:\s*(?:re|fwd?)(?:\[\d+\])?:\s*)+/i;

function matchesSubjectPattern(
  pattern: string,
  subject: string,
  logger: Logger,
  options?: { anchorStart?: boolean },
) {
  if (matchesTextPattern(pattern, subject, logger, options)) return true;

  // Users write conditions from what they see ("RE: Daily") and mailers
  // stack prefixes freely — strip them from BOTH sides so the condition
  // describes the topic, and original vs reply match alike
  const strippedSubject = subject.replace(REPLY_PREFIX_REGEX, "");
  const strippedPattern = pattern.replace(REPLY_PREFIX_REGEX, "");
  if (strippedSubject === subject && strippedPattern === pattern) return false;
  return matchesTextPattern(strippedPattern, strippedSubject, logger, options);
}

function matchesRulePattern(
  pattern: string,
  text: string,
  anchorStart?: boolean,
) {
  return createRulePatternRegex(pattern, anchorStart).test(text);
}

// Escape regex metacharacters (pipes included — from/to lists are split on
// them BEFORE reaching here, so a pipe in a subject/body pattern is literal
// text), then turn the `*` glob into `.*`.
function globToRegexSource(pattern: string) {
  return pattern.replace(/[.+?^${}()[\]\\|]/g, "\\$&").replace(/\*/g, ".*");
}

// Unanchored by default: intended for subject/body keyword and display-name
// substring matching. anchorStart pins the pattern to the beginning ("starts
// with" subject conditions). Case-insensitive: a rule for "RE: Daily" must
// match "Re: Daily Report" — nobody types conditions to match mailer casing.
function createRulePatternRegex(pattern: string, anchorStart?: boolean) {
  return new RegExp((anchorStart ? "^" : "") + globToRegexSource(pattern), "i");
}

// Anchored: for from/to address patterns, so a pattern matches a whole address
// boundary and cannot be satisfied by a spoofed prefix/suffix (e.g. a rule for
// `boss@company.com` must not match `boss@company.com.evil.com`).
function createAnchoredAddressRegex(pattern: string) {
  // `@domain` → any local part, exact domain (no subdomain), e.g. user@domain.
  if (pattern.startsWith("@")) {
    return new RegExp(`^.*${globToRegexSource(pattern)}$`);
  }
  // `local@domain` → exact address (local part may contain `*` wildcards).
  if (pattern.includes("@")) {
    return new RegExp(`^${globToRegexSource(pattern)}$`);
  }
  // Bare domain → addresses at that domain or a subdomain (`@domain`/`.domain`),
  // but not a lookalike domain (e.g. `example.com` must not match myexample.com).
  return new RegExp(`^.*[@.]${globToRegexSource(pattern)}$`);
}

function matchesEmailFieldPattern({
  pattern,
  addressText,
  displayNameText,
  logInvalidPattern,
}: {
  pattern: string;
  addressText: string;
  displayNameText: string;
  logInvalidPattern: (pattern: string, error: unknown) => void;
}) {
  try {
    const patterns = splitEmailPatterns(pattern);

    for (const patternPart of patterns) {
      const normalizedPattern = patternPart.trim().toLowerCase();
      const regex = createRulePatternRegex(normalizedPattern);

      if (isAddressLikeEmailPattern(patternPart)) {
        // `addressText` may hold several recipients joined as "a@x, b@y"; the
        // anchored regex must be tested against each address individually.
        const addressRegex = createAnchoredAddressRegex(normalizedPattern);
        const addresses = addressText.split(", ").filter(Boolean);
        if (addresses.some((address) => addressRegex.test(address)))
          return true;
        continue;
      }

      if (displayNameText && regex.test(displayNameText)) return true;
      if (regex.test(addressText)) return true;
    }

    return false;
  } catch (error) {
    logInvalidPattern(pattern, error);
    return false;
  }
}

function logInvalidEmailMatchPattern({
  logger,
  pattern,
  error,
}: {
  logger: Logger;
  pattern: string;
  error: unknown;
}) {
  logger.error("Invalid email match pattern");
  logger.trace("Invalid email match pattern details", { pattern, error });
}
