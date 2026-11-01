import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import { compareLabelsByName } from "@/utils/label/compare-labels";
import type { Logger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { toggleRule } from "@/utils/rule/toggle-rule";
import { getMailSettings } from "@/utils/split-inbox/settings.server";
import { createMailSplitOrThrow } from "@/utils/split-inbox/splits.server";
import {
  availableLibraryFilters,
  findLibrarySplit,
  SPLIT_LIBRARY,
} from "@/utils/split-inbox/split-library";

export async function getMailSplitPresets({
  emailAccountId,
  emailProvider,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  const [settings, labels] = await Promise.all([
    getMailSettings({ emailAccountId }),
    emailProvider.getLabels({ includeHidden: true }),
  ]);
  const choices = labels
    .filter((label) => label.type === "user")
    .sort(compareLabelsByName);
  if (emailProvider.name === "google")
    choices.push({
      id: GmailLabel.IMPORTANT,
      name: "Important",
      type: "system",
    });
  const maps = {
    labelsByName: new Map(
      choices.map((label) => [label.name.toLowerCase(), label.id]),
    ),
    // The current library has no native-category presets.
    categoriesByName: new Map<string, string>(),
  };
  return SPLIT_LIBRARY.flatMap((entry) => {
    if (
      emailProvider.name === "microsoft" &&
      entry.conditions.some((condition) => condition.kind === "STARRED")
    )
      return [];
    const filters = availableLibraryFilters(entry, maps);
    if (filters === null) return [];
    const split = findLibrarySplit(entry, filters, settings.splits);
    return [
      {
        presetId: entry.name,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        matchAll: entry.matchAll ?? true,
        filters,
        createsSystemType: entry.createsSystemType ?? null,
        added: !!split,
        splitId: split?.id ?? null,
      },
    ];
  });
}

export async function createMailSplitFromPreset({
  emailAccountId,
  emailProvider,
  presetId,
  logger,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
  presetId: string;
  logger: Logger;
}) {
  const presets = await getMailSplitPresets({ emailAccountId, emailProvider });
  const preset = presets.find((entry) => entry.presetId === presetId);
  if (!preset) throw new SafeError("Split preset not available");
  if (preset.createsSystemType) {
    await toggleRule({
      emailAccountId,
      provider: emailProvider.name,
      logger,
      ruleId: undefined,
      systemType: preset.createsSystemType,
      enabled: true,
    });
    return;
  }
  await createMailSplitOrThrow({
    emailAccountId,
    name: preset.name,
    filters: preset.filters,
    matchAll: preset.matchAll,
  });
}
