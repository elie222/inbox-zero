import type { MatchReason } from "@/utils/ai/choose-rule/types";
import { ConditionType } from "@/utils/config";

export function getMatchesReasoning(
  matches: { matchReasons?: MatchReason[] }[],
): string {
  return matches
    .map((match) => getMatchReason(match.matchReasons))
    .filter((reason): reason is string => !!reason)
    .join(", ");
}

export function combineReasoning(...reasons: (string | undefined)[]) {
  return reasons
    .map((reason) => reason?.trim())
    .filter((reason): reason is string => !!reason)
    .join("; ");
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
