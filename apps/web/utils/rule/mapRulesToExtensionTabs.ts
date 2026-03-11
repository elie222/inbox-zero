import type { RulesResponse } from "@/app/api/user/rules/route";

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
  Newsletter: "newsletter",
  Marketing: "marketing",
  Calendar: "calendar",
  Receipt: "receipt",
  Notification: "notification",
  "Cold Email": "cold-email",
  "Follow-up": "follow-up",
  FYI: "fyi",
  Actioned: "actioned",
};

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

  return tabs;
}
