import type { Category, Group, GroupItem, SystemType } from "@prisma/client";
import type { ConditionType } from "@/utils/config";
import type { RuleWithActionsAndCategories } from "@/utils/types";

export type StaticMatch = {
  type: Extract<ConditionType, "STATIC">;
};

export type GroupMatch = {
  type: Extract<ConditionType, "GROUP">;
  group: Pick<Group, "id" | "name">;
  groupItem: Pick<GroupItem, "id" | "type" | "value" | "exclude">;
};

export type CategoryMatch = {
  type: Extract<ConditionType, "CATEGORY">;
  category: Pick<Category, "id" | "name">;
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
  | GroupMatch
  | CategoryMatch
  | AiMatch
  | PresetMatch;

export type MatchingRuleResult = {
  match?: RuleWithActionsAndCategories;
  matchReasons?: MatchReason[];
  potentialMatches?: (RuleWithActionsAndCategories & {
    instructions: string;
  })[];
};
