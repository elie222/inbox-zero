import type { Group, GroupItem, SystemType } from "@prisma/client";
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
  potentialAiMatches: (RuleWithActions & {
    instructions: string;
  })[];
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
        type: string;
        value: string;
        exclude: boolean;
      };
    }
  | { type: "AI" }
  | { type: "PRESET"; systemType: string };

/**
 * Serializes match reasons to a JSON-safe format for database storage
 */
export function serializeMatchReasons(
  matchReasons?: MatchReason[],
): SerializedMatchReason[] | undefined {
  if (!matchReasons || matchReasons.length === 0) return undefined;

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
