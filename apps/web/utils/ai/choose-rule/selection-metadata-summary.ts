import { isDefined } from "@/utils/types";
import type { RuleSelectionMetadata } from "@/utils/ai/choose-rule/types";

export function summarizeSelectionMetadata(
  selectionMetadata: Array<RuleSelectionMetadata | undefined>,
) {
  const allSelectionMetadata = selectionMetadata.filter(isDefined);

  return {
    skippedThreadRuleNames: allSelectionMetadata
      .flatMap((metadata) => metadata.skippedThreadRuleNames)
      .join(", "),
    learnedPatternExcludedRules: allSelectionMetadata
      .flatMap((metadata) =>
        metadata.learnedPatternExcludedRules.map(
          (rule) => `${rule.ruleName}:${rule.itemType}:${rule.groupName}`,
        ),
      )
      .join(", "),
    remainingAiRuleNames: allSelectionMetadata
      .flatMap((metadata) => metadata.remainingAiRuleNames)
      .join(", "),
    conversationFilterReason: allSelectionMetadata
      .map((metadata) => metadata.conversationFilterReason)
      .filter(isDefined)
      .join(", "),
  };
}

export function getSelectionMetadataTraceDetails(
  selectionMetadata: Array<RuleSelectionMetadata | undefined>,
) {
  const allSelectionMetadata = selectionMetadata.filter(isDefined);

  return {
    learnedPatternExcludedRuleDetails: allSelectionMetadata
      .flatMap((metadata) =>
        metadata.learnedPatternExcludedRules.map((rule) => ({
          ruleName: rule.ruleName,
          itemType: rule.itemType,
          itemValue: rule.itemValue,
          groupName: rule.groupName,
        })),
      )
      .filter((rule) => !!rule.itemValue),
  };
}
