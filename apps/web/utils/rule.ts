import { RuleType } from "@prisma/client";

export function ruleTypeToString(ruleType: RuleType) {
  switch (ruleType) {
    case RuleType.AI:
      return "AI";
    case RuleType.STATIC:
      return "Static";
    case RuleType.GROUP:
      return "Group";
  }
}
