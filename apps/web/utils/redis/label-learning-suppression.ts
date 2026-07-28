import { redis } from "@/utils/redis";
import type { Logger } from "@/utils/logger";

// Our own label strips (reprocess finalize, stale-label reconcile, filter
// backfill, cold-email undo) round-trip through the provider webhook looking
// exactly like a user removing a label. Marking them here lets the webhook's
// learning path tell them apart so we never learn from our own actions.
// Fail-open on Redis errors: a missed suppression costs one spurious learned
// pattern (visible and undoable), while failing closed would break learning.

const SUPPRESSION_TTL_SECONDS = 60 * 10;

function getSuppressionKey({
  emailAccountId,
  threadId,
  labelId,
}: {
  emailAccountId: string;
  threadId: string;
  labelId: string;
}) {
  return `label-learning-suppression:${emailAccountId}:${threadId}:${labelId}`;
}

export async function suppressLabelLearning({
  emailAccountId,
  threadId,
  labelIds,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  labelIds: string[];
  logger: Logger;
}) {
  try {
    await Promise.all(
      labelIds.map((labelId) =>
        redis.set(
          getSuppressionKey({ emailAccountId, threadId, labelId }),
          "true",
          { ex: SUPPRESSION_TTL_SECONDS },
        ),
      ),
    );
  } catch (error) {
    logger.warn("Failed to suppress label learning", { error, threadId });
  }
}

export async function isLabelLearningSuppressed({
  emailAccountId,
  threadId,
  labelId,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  labelId: string;
  logger: Logger;
}): Promise<boolean> {
  try {
    const value = await redis.get(
      getSuppressionKey({ emailAccountId, threadId, labelId }),
    );
    return value !== null;
  } catch (error) {
    logger.warn("Failed to check label learning suppression", {
      error,
      threadId,
    });
    return false;
  }
}
