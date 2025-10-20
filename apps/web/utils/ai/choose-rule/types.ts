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
