import type { Logger } from "@/utils/logger";

const DEFAULT_RUNNING_WARN_AFTER_MS = 10_000;
const DEFAULT_SLOW_WARN_AFTER_MS = 3000;

export function startRequestTimer({
  logger,
  requestName,
  runningWarnAfterMs = DEFAULT_RUNNING_WARN_AFTER_MS,
  slowWarnAfterMs = DEFAULT_SLOW_WARN_AFTER_MS,
}: {
  logger: Logger;
  requestName: string;
  runningWarnAfterMs?: number;
  slowWarnAfterMs?: number;
}) {
  const startedAt = Date.now();
  const runningTimeout = setTimeout(() => {
    logger.warn(`${requestName} still running`, {
      elapsedMs: Date.now() - startedAt,
    });
  }, runningWarnAfterMs);

  return {
    durationMs: () => Date.now() - startedAt,
    logSlowCompletion: (metadata?: Record<string, unknown>) => {
      const durationMs = Date.now() - startedAt;
      if (durationMs > slowWarnAfterMs) {
        logger.warn(`${requestName} completed slowly`, {
          durationMs,
          ...metadata,
        });
      }
      return durationMs;
    },
    stop: () => clearTimeout(runningTimeout),
  };
}
