import { captureException } from "@/utils/error";
import { flushAuditEvents } from "@/utils/audit/delivery";
import { getAuditContext, runWithAuditContext } from "@/utils/audit/context";
import type { Logger } from "@/utils/logger";

type LoggerFlushExtra = Record<string, unknown>;

export async function flushLoggerSafely(
  logger: Logger,
  extra?: LoggerFlushExtra,
) {
  await Promise.all([
    logger.flush().catch((error) => {
      captureException(error, {
        extra: { ...extra, flushContext: "logger-flush" },
      });
    }),
    flushAuditEvents().catch((error) => {
      captureException(error, {
        extra: { ...extra, flushContext: "audit-flush" },
      });
    }),
  ]);
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
  const auditContext = getAuditContext();
  try {
    await runWithAuditContext(auditContext, task);
  } finally {
    await flushLoggerSafely(logger, {
      ...extra,
      taskContext: "background-task",
    });
  }
}
