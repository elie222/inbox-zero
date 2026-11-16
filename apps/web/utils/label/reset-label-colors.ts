import { ActionType } from "@/generated/prisma/enums";
import type {
  EmailLabel,
  EmailLabelColor,
  EmailProvider,
} from "@/utils/email/types";
import { getDefaultLabelColorName, type LabelColorName } from "@/utils/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getRuleLabel } from "@/utils/rule/consts";

export async function resetDefaultLabelColors({
  emailAccountId,
  emailProvider,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  logger: Logger;
}) {
  const [labels, systemRules] = await Promise.all([
    emailProvider.getLabels({ includeHidden: true }),
    prisma.rule.findMany({
      where: { emailAccountId, systemType: { not: null } },
      select: {
        systemType: true,
        actions: {
          // Keep label actions without an id so a lone extra label is not
          // mistaken for the built-in one.
          where: { type: ActionType.LABEL },
          select: { labelId: true, label: true },
        },
      },
    }),
  ]);

  // System rules may point at labels the user renamed, so match those by id.
  const colorNameByLabelId = new Map<string, LabelColorName>();
  for (const rule of systemRules) {
    if (!rule.systemType) continue;
    const defaultName = getRuleLabel(rule.systemType);
    const colorName = getDefaultLabelColorName(defaultName);
    if (!colorName) continue;
    // A rule can carry extra user-chosen labels; only its built-in one gets the default.
    const systemAction =
      rule.actions.length === 1
        ? rule.actions[0]
        : rule.actions.find((action) => action.label === defaultName);
    if (systemAction?.labelId)
      colorNameByLabelId.set(systemAction.labelId, colorName);
  }

  let updated = 0;
  let failed = 0;

  for (const label of labels) {
    const colorName =
      colorNameByLabelId.get(label.id) ?? getDefaultLabelColorName(label.name);
    if (!colorName) continue;

    const color = emailProvider.getDefaultLabelColor(colorName);
    if (hasColor(label, color)) continue;

    try {
      await emailProvider.updateLabel(label.id, { color });
      updated++;
    } catch (error) {
      failed++;
      logger.error("Failed to reset label color", { error });
    }
  }

  return { updated, failed };
}

function hasColor(label: EmailLabel, color: EmailLabelColor) {
  const current = label.color;
  if (!current?.backgroundColor) return false;
  if (
    current.backgroundColor.toLowerCase() !==
    color.backgroundColor.toLowerCase()
  )
    return false;
  // Outlook categories have no text color, so only compare it when the provider reports one.
  return (
    !current.textColor ||
    current.textColor.toLowerCase() === color.textColor.toLowerCase()
  );
}
