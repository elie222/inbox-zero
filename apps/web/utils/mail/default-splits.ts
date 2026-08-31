import {
  ActionType,
  MailSplitKind,
  type SystemType,
} from "@/generated/prisma/enums";
import {
  getRuleLabel,
  STANDARD_CATEGORY_SYSTEM_TYPES,
} from "@/utils/rule/consts";

type RuleForDefaultSplit = {
  systemType: SystemType | null;
  actions: Array<{
    type: ActionType;
    labelId: string | null;
  }>;
};

export function getDefaultMailSplitDrafts(rules: RuleForDefaultSplit[]) {
  const rulesBySystemType = new Map(
    rules.flatMap((rule) =>
      rule.systemType ? [[rule.systemType, rule] as const] : [],
    ),
  );

  return STANDARD_CATEGORY_SYSTEM_TYPES.flatMap((systemType) => {
    const rule = rulesBySystemType.get(systemType);
    const movesOutOfInbox = rule?.actions.some(
      (action) =>
        action.type === ActionType.ARCHIVE ||
        action.type === ActionType.MOVE_FOLDER,
    );
    const labelId = rule?.actions.find(
      (action) => action.type === ActionType.LABEL && action.labelId,
    )?.labelId;

    return labelId && !movesOutOfInbox
      ? [
          {
            name: getRuleLabel(systemType),
            kind: MailSplitKind.LABEL,
            value: labelId,
          },
        ]
      : [];
  });
}
