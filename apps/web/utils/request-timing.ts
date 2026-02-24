import type { Logger } from "@/utils/logger";

export function startRequestTimer({
  logger,
  requestName,
  runningWarnAfterMs,
  slowWarnAfterMs,
}: {
  logger: Logger;
  requestName: string;
  runningWarnAfterMs: number;
  slowWarnAfterMs: number;
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
