import type { Logger } from "@/utils/logger";

export type SubscriptionHistoryEntry = {
  subscriptionId: string;
  createdAt: string;
  replacedAt: string;
};

export type SubscriptionHistory = SubscriptionHistoryEntry[];

export function parseSubscriptionHistory(
  rawHistory: unknown,
  logger?: Logger,
): SubscriptionHistory {
  if (!rawHistory) {
    return [];
  }

  try {
    if (Array.isArray(rawHistory)) {
      // Validate that each entry has the required fields
      return rawHistory.filter((entry): entry is SubscriptionHistoryEntry => {
        const hasRequiredFields =
          typeof entry === "object" &&
          entry !== null &&
          "subscriptionId" in entry &&
          "createdAt" in entry &&
          "replacedAt" in entry &&
          typeof entry.subscriptionId === "string" &&
          typeof entry.createdAt === "string" &&
          typeof entry.replacedAt === "string";

        if (!hasRequiredFields) {
          logger?.warn("Invalid subscription history entry", { entry });
        }

        return hasRequiredFields;
      });
    }
  } catch (error) {
    logger?.warn("Failed to parse subscription history", { error });
  }

  return [];
}

function createHistoryEntry(
  subscriptionId: string,
  createdAt: string,
  replacedAt: string,
): SubscriptionHistoryEntry {
  return {
    subscriptionId,
    createdAt,
    replacedAt,
  };
}

export function cleanupOldHistoryEntries(
  history: SubscriptionHistory,
  daysToKeep = 30,
): SubscriptionHistory {
  const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  return history.filter((entry) => new Date(entry.replacedAt) > cutoffDate);
}

export function isSubscriptionInHistory(
  subscriptionId: string,
  rawHistory: unknown,
): boolean {
  const history = parseSubscriptionHistory(rawHistory);
  return history.some((entry) => entry.subscriptionId === subscriptionId);
}

export function addToHistory(
  currentHistory: unknown,
  subscriptionId: string,
  createdAt: string,
  replacedAt: string,
  logger?: Logger,
): SubscriptionHistory {
  const parsed = parseSubscriptionHistory(currentHistory, logger);
  const newEntry = createHistoryEntry(subscriptionId, createdAt, replacedAt);
  return [...parsed, newEntry];
}

export function addCurrentSubscriptionToHistory(
  currentHistory: unknown,
  subscriptionId: string,
  replacedAt: Date,
  fallbackCreatedAt: Date,
  logger?: Logger,
): SubscriptionHistory {
  const parsed = parseSubscriptionHistory(currentHistory, logger);

  const estimatedCreatedAt =
    parsed.length > 0
      ? parsed[parsed.length - 1].replacedAt
      : fallbackCreatedAt.toISOString();

  const newEntry = createHistoryEntry(
    subscriptionId,
    estimatedCreatedAt,
    replacedAt.toISOString(),
  );

  return [...parsed, newEntry];
}
