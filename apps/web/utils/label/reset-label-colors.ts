import { ActionType } from "@/generated/prisma/enums";
import type { EmailLabelColor, EmailProvider } from "@/utils/email/types";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import {
  getDefaultLabelColorName,
  getGmailDefaultLabelColor,
  type LabelColorName,
} from "@/utils/label";
import type { Logger } from "@/utils/logger";
import {
  getDefaultOutlookCategoryColor,
  OUTLOOK_CATEGORY_COLOR_MAP,
} from "@/utils/outlook/category-colors";
import prisma from "@/utils/prisma";
import { getRuleLabel } from "@/utils/rule/consts";

export async function resetDefaultLabelColors({
  emailAccountId,
  emailProvider,
  provider,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  provider: string;
  logger: Logger;
}) {
  const [labels, systemRules] = await Promise.all([
    emailProvider.getLabels({ includeHidden: true }),
    prisma.rule.findMany({
      where: { emailAccountId, systemType: { not: null } },
      select: {
        systemType: true,
        actions: {
          where: { type: ActionType.LABEL, labelId: { not: null } },
          select: { labelId: true },
        },
      },
    }),
  ]);

  // System rules may point at labels the user renamed, so match those by id.
  const colorNameByLabelId = new Map<string, LabelColorName>();
  for (const rule of systemRules) {
    if (!rule.systemType) continue;
    const colorName = getDefaultLabelColorName(getRuleLabel(rule.systemType));
    if (!colorName) continue;
    for (const action of rule.actions) {
      if (action.labelId) colorNameByLabelId.set(action.labelId, colorName);
    }
  }

  let updated = 0;
  let failed = 0;

  for (const label of labels) {
    const colorName =
      colorNameByLabelId.get(label.id) ?? getDefaultLabelColorName(label.name);
    if (!colorName) continue;

    const color = getProviderDefaultColor(provider, colorName);
    if (
      label.color?.backgroundColor?.toLowerCase() ===
      color.backgroundColor.toLowerCase()
    )
      continue;

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

function getProviderDefaultColor(
  provider: string,
  colorName: LabelColorName,
): EmailLabelColor {
  if (isMicrosoftProvider(provider)) {
    return {
      backgroundColor:
        OUTLOOK_CATEGORY_COLOR_MAP[getDefaultOutlookCategoryColor(colorName)],
      textColor: "#000000",
    };
  }
  return getGmailDefaultLabelColor(colorName);
}
