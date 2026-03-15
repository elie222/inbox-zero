import type { RulesResponse } from "@/app/api/user/rules/route";
import { ActionType } from "@/generated/prisma/enums";

// Keep in sync with inbox-zero-tabs-wxt/entrypoints/background.ts
export type SyncTab = {
  displayLabel: string;
} & (
  | { type: "enable_default"; tabId: string }
  | { type: "add_custom"; label: string; icon: string; query: string }
);

// Keep in sync with inbox-zero-tabs-wxt/config/tabs.ts defaultTabsConfig IDs
const LABEL_TO_DEFAULT_TAB: Record<string, string> = {
  "To Reply": "to-reply",
  "Awaiting Reply": "awaiting-reply",
  FYI: "fyi",
  Actioned: "actioned",
  Newsletter: "newsletter",
  Marketing: "marketing",
  Calendar: "calendar",
  Receipt: "receipt",
  Notification: "notification",
  "Cold Email": "cold-email",
  "Follow-up": "follow-up",
  Team: "team",
  GitHub: "github",
  Stripe: "stripe",
};

// Matches SYSTEM_RULE_ORDER from utils/rule/consts.ts, with Follow-up appended
const LABEL_ORDER: string[] = [
  "To Reply",
  "Awaiting Reply",
  "FYI",
  "Actioned",
  "Newsletter",
  "Marketing",
  "Calendar",
  "Receipt",
  "Notification",
  "Cold Email",
  "Follow-up",
  "Team",
  "GitHub",
  "Stripe",
];

function labelToGmailSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "");
}

export function mapRulesToExtensionTabs(rules: RulesResponse): SyncTab[] {
  const tabs: SyncTab[] = [];
  const seenLabels = new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.actions.some((action) => action.type === ActionType.ARCHIVE))
      continue;

    for (const action of rule.actions) {
      if (action.type !== "LABEL" || !action.label) continue;

      const label = action.label;
      if (seenLabels.has(label)) continue;
      seenLabels.add(label);

      const defaultTabId = LABEL_TO_DEFAULT_TAB[label];
      if (defaultTabId) {
        tabs.push({
          type: "enable_default",
          tabId: defaultTabId,
          displayLabel: label,
        });
      } else {
        tabs.push({
          type: "add_custom",
          label,
          icon: "🏷️",
          query: `in:inbox label:${labelToGmailSlug(label)}`,
          displayLabel: label,
        });
      }
    }
  }

  tabs.sort((a, b) => {
    const aIndex = LABEL_ORDER.indexOf(a.displayLabel);
    const bIndex = LABEL_ORDER.indexOf(b.displayLabel);
    // Known labels first in defined order, custom labels at end alphabetically
    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    return a.displayLabel.localeCompare(b.displayLabel);
  });

  return tabs;
}
