import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { Category, Group, GroupItem } from "@prisma/client";
import type { ConditionType } from "@/utils/config";

export type StaticMatch = {
  type: Extract<ConditionType, "STATIC">;
};

export type GroupMatch = {
  type: Extract<ConditionType, "GROUP">;
  group: Pick<Group, "id" | "name">;
  groupItem: Pick<GroupItem, "id" | "type" | "value">;
};

export type CategoryMatch = {
  type: Extract<ConditionType, "CATEGORY">;
  category: Pick<Category, "id" | "name">;
};

export type AiMatch = {
  type: Extract<ConditionType, "AI">;
};

export type MatchReason = StaticMatch | GroupMatch | CategoryMatch | AiMatch;

export type MatchingRuleResult = {
  match?: RuleWithActionsAndCategories;
  matchReasons?: MatchReason[];
  potentialMatches?: (RuleWithActionsAndCategories & {
    instructions: string;
  })[];
};
