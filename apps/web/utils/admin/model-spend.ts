import { getAdminAiModelSpendByPeriod } from "@inboxzero/tinybird-ai-analytics";
import { createScopedLogger } from "@/utils/logger";
import { getWeeklyUsageCostWindow } from "@/utils/redis/usage";

export const MODEL_SPEND_LIMIT = 25;

const logger = createScopedLogger("admin/model-spend");

/**
 * Cross-tenant AI spend for the current weekly window.
 *
 * Tinybird is optional, so a missing or failing pipe degrades to an empty
 * list rather than failing the caller.
 */
export async function getAdminModelSpendForWeek(now = new Date()) {
  const { startTimestampMs, endTimestampMs } = getWeeklyUsageCostWindow(now);

  try {
    return await getAdminAiModelSpendByPeriod({
      startTimestampMs,
      endTimestampMs,
      limit: MODEL_SPEND_LIMIT,
    });
  } catch (error) {
    logger.error("Failed to load admin model spend", { error });
    return [];
  }
}
