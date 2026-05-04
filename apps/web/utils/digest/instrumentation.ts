import { createScopedLogger } from "@/utils/logger";

const baseLogger = createScopedLogger("digest/instrumentation");

/**
 * Phase 4 anomaly A2 instrumentation.
 *
 * Per Phase 3 verification: ~12% of DIGEST ExecutedActions do not produce a
 * corresponding DigestItem row. Likely cause is silent failure in the BullMQ /
 * QStash enqueue path. Wrap the DIGEST action runner's enqueue call so we can
 * correlate ExecutedAction → DigestItem from production logs.
 */
export async function traceDigestEnqueue<T>(
  ctx: {
    executedActionId: string | undefined;
    emailAccountId: string;
    messageId: string;
    ruleName?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const logger = baseLogger.with(ctx);
  logger.info("digest.enqueue.start");
  try {
    const result = await fn();
    logger.info("digest.enqueue.success");
    return result;
  } catch (err) {
    logger.error("digest.enqueue.failure", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
