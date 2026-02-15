import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";

type LoggerFlushExtra = Record<string, unknown>;

export async function flushLoggerSafely(
  logger: Logger,
  extra?: LoggerFlushExtra,
) {
  try {
    await logger.flush();
  } catch (error) {
    captureException(error, {
      extra: {
        ...extra,
        flushContext: "logger-flush",
      },
    });
  }
}

export async function runWithBackgroundLoggerFlush({
  logger,
  task,
  extra,
}: {
  logger: Logger;
  task: () => Promise<void>;
  extra?: LoggerFlushExtra;
}) {
  try {
    await task();
  } finally {
    await flushLoggerSafely(logger, {
      ...extra,
      taskContext: "background-task",
    });
  }
}
