import type { RuleWithActionsAndCategories } from "@/utils/types";
import type { GroupItem, RuleType } from "@prisma/client";

export type MatchReason = {
  type: RuleType;
} & (
  | {
      type: "STATIC";
    }
  | {
      type: "GROUP";
      groupItem: Pick<GroupItem, "id" | "type" | "value">;
    }
  | {
      type: "CATEGORY";
      categoryId: string;
      categoryName: string;
    }
  | {
      type: "AI";
    }
);

export type MatchingRuleResult = {
  match?: RuleWithActionsAndCategories;
  matchReasons?: MatchReason[];
  potentialMatches?: (RuleWithActionsAndCategories & {
    instructions: string;
  })[];
};
