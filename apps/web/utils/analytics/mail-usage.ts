import posthog from "posthog-js";
import { MAIL_ANALYTICS_EVENTS } from "@/utils/analytics/product";
import {
  runWhenIdle,
  scheduleSummaryFlush,
} from "@/utils/analytics/summary-flush";

// Pressed many times a minute, so counted and sent as one summary.
const NAVIGATION_SHORTCUT_IDS = new Set<string>([
  "next",
  "previous",
  "extendSelectionDown",
  "extendSelectionUp",
]);

let navigationCounts: Record<string, number> = {};
let navigationFlushScheduled = false;

export function trackMailAction({
  action,
  source,
  shortcut,
}: {
  action: string;
  source: "shortcut" | "palette";
  shortcut?: string;
}) {
  if (source === "shortcut" && NAVIGATION_SHORTCUT_IDS.has(action)) {
    navigationCounts[action] = (navigationCounts[action] ?? 0) + 1;
    if (!navigationFlushScheduled) {
      navigationFlushScheduled = true;
      scheduleSummaryFlush(flushNavigationCounts);
    }
    return;
  }

  // Keeps PostHog's property and persistence work out of the key handler.
  runWhenIdle(() =>
    posthog.capture(MAIL_ANALYTICS_EVENTS.action, {
      action,
      source,
      ...(shortcut ? { shortcut } : {}),
    }),
  );
}

function flushNavigationCounts(
  capture: (event: string, properties: Record<string, unknown>) => void,
) {
  const counts = navigationCounts;
  navigationCounts = {};

  const properties: Record<string, number> = {};
  let total = 0;
  for (const [action, count] of Object.entries(counts)) {
    properties[`${action}_count`] = count;
    total += count;
  }
  if (total === 0) return;

  capture(MAIL_ANALYTICS_EVENTS.navigationSummary, {
    ...properties,
    total_count: total,
  });
}
