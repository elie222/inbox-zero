import type { GroupItemType, SystemType } from "@/generated/prisma/enums";
import type { Group, GroupItem } from "@/generated/prisma/client";
import type { ConditionType } from "@/utils/config";
import type { RuleWithActions } from "@/utils/types";

export type StaticMatch = {
  type: Extract<ConditionType, "STATIC">;
};

export type LearnedPatternMatch = {
  type: Extract<ConditionType, "LEARNED_PATTERN">;
  group: Pick<Group, "id" | "name">;
  groupItem: Pick<GroupItem, "id" | "type" | "value" | "exclude">;
};

export type AiMatch = {
  type: Extract<ConditionType, "AI">;
};

export type PresetMatch = {
  type: Extract<ConditionType, "PRESET">;
  systemType: SystemType;
};

export type MatchReason =
  | StaticMatch
  | LearnedPatternMatch
  | AiMatch
  | PresetMatch;

export type MatchingRuleResult = {
  matches: {
    rule: RuleWithActions;
    matchReasons: MatchReason[];
  }[];
  potentialAiMatches: PotentialAiMatchRule[];
  selectionMetadata: RuleSelectionMetadata;
};

// A rule pooled for AI judgment, carrying what the engine already
// established: static-condition outcomes (kept so an AI confirmation
// records the full match trail) and whether this rule previously filed
// messages in the same thread (surfaced to the AI as continuity evidence)
export type PotentialAiMatchRule = RuleWithActions & {
  instructions: string;
  pendingMatchReasons?: MatchReason[];
  previouslyMatchedThread?: boolean;
};

export type RuleSelectionMetadata = {
  isThread: boolean;
  skippedThreadRuleNames: string[];
  continuedThreadRuleNames: string[];
  // Rules skipped because the sender is a saved contact (excludeKnownContacts)
  knownContactSkippedRuleNames: string[];
  // Rules dropped because their static conditions (from/to/subject) didn't
  // match — AND rules whose static leg failed, or static-only rules
  staticFailedRuleNames: string[];
  filteredConversationRuleNames: string[];
  conversationFilterReason?: string;
  remainingAiRuleNames: string[];
  learnedPatternExcludedRules: {
    ruleId: string;
    ruleName: string;
    groupId: string;
    groupName: string;
    itemType: GroupItemType;
    itemValue: string;
  }[];
};

/**
 * Serializable version of MatchReason for database storage
 */
export type SerializedMatchReason =
  | { type: "STATIC" }
  | {
      type: "LEARNED_PATTERN";
      group: { id: string; name: string };
      groupItem: {
        id: string;
        type: GroupItemType;
        value: string;
        exclude: boolean;
      };
    }
  | { type: "AI" }
  | { type: "PRESET"; systemType: SystemType };

/**
 * Serializes match reasons to a JSON-safe format for database storage
 */
export function serializeMatchReasons(
  matchReasons?: MatchReason[],
): SerializedMatchReason[] | undefined {
  if (!matchReasons || matchReasons.length === 0) return;

  return matchReasons.map((reason): SerializedMatchReason => {
    switch (reason.type) {
      case "STATIC":
        return { type: "STATIC" };
      case "LEARNED_PATTERN":
        return {
          type: "LEARNED_PATTERN",
          group: {
            id: reason.group.id,
            name: reason.group.name,
          },
          groupItem: {
            id: reason.groupItem.id,
            type: reason.groupItem.type,
            value: reason.groupItem.value,
            exclude: reason.groupItem.exclude,
          },
        };
      case "AI":
        return { type: "AI" };
      case "PRESET":
        return { type: "PRESET", systemType: reason.systemType };
    }
  });
}
