import type { RulesResponse } from "@/app/api/user/rules/route";
import { ActionType } from "@/generated/prisma/enums";
import { normalizeLabelName } from "@/utils/label/normalize-label-name";

// Keep in sync with inbox-zero-tabs-wxt/entrypoints/background.ts
export type SyncTab = {
  displayLabel: string;
} & (
  | { type: "enable_default"; tabId: string }
  | { type: "add_custom"; label: string; icon: string; query: string }
);

// Keep in sync with inbox-zero-tabs-wxt/config/tabs.ts defaultTabsConfig IDs
const DEFAULT_TABS = [
  { label: "To Reply", tabId: "to-reply" },
  { label: "Awaiting Reply", tabId: "awaiting-reply" },
  { label: "FYI", tabId: "fyi" },
  { label: "Actioned", tabId: "actioned" },
  { label: "Newsletter", tabId: "newsletter" },
  { label: "Marketing", tabId: "marketing" },
  { label: "Calendar", tabId: "calendar" },
  { label: "Receipt", tabId: "receipt" },
  { label: "Notification", tabId: "notification" },
  { label: "Cold Email", tabId: "cold-email" },
  { label: "Follow-up", tabId: "follow-up" },
  { label: "Team", tabId: "team" },
  { label: "GitHub", tabId: "github" },
  { label: "Stripe", tabId: "stripe" },
] as const;

const LABEL_TO_DEFAULT_TAB = Object.fromEntries(
  DEFAULT_TABS.map((tab) => [normalizeLabelName(tab.label), tab]),
);

// Matches SYSTEM_RULE_ORDER from utils/rule/consts.ts, with Follow-up appended
const LABEL_ORDER = DEFAULT_TABS.map((tab) => normalizeLabelName(tab.label));

function labelToGmailSlug(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "");
}

export function mapRulesToExtensionTabs(rules: RulesResponse): SyncTab[] {
  const tabs: SyncTab[] = [];
  const seenLabels = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    const archivesMessages = rule.actions.some(
      (action) => action.type === ActionType.ARCHIVE,
    );
    for (const action of rule.actions) {
      if (action.type !== ActionType.LABEL || !action.label) continue;

      const label = action.label.trim();
      const normalizedLabel = normalizeLabelName(label);
      const seenLabelKey = normalizeSeenLabel(label);
      if (!label) continue;

      const defaultTab = LABEL_TO_DEFAULT_TAB[normalizedLabel];
      const dedupeKey = defaultTab ? normalizedLabel : seenLabelKey;
      if (seenLabels.has(dedupeKey)) continue;
      seenLabels.add(dedupeKey);

      if (defaultTab && !archivesMessages) {
        tabs.push({
          type: "enable_default",
          tabId: defaultTab.tabId,
          displayLabel: defaultTab.label,
        });
      } else {
        const queryPrefix = archivesMessages ? "" : "in:inbox ";
        tabs.push({
          type: "add_custom",
          label,
          icon: "🏷️",
          query: `${queryPrefix}label:${labelToGmailSlug(label)}`,
          displayLabel: label,
        });
      }
    }
  }

  tabs.sort((a, b) => {
    const aIndex = LABEL_ORDER.indexOf(normalizeLabelName(a.displayLabel));
    const bIndex = LABEL_ORDER.indexOf(normalizeLabelName(b.displayLabel));
    // Known labels first in defined order, custom labels at end alphabetically
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.displayLabel.localeCompare(b.displayLabel);
  });

  return tabs;
}

function normalizeSeenLabel(label: string) {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}
