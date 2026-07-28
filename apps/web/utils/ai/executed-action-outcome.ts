import type { ExecutedActionStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";
import { getErrorMessage } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export type PersistedActionError = {
  code: string;
  message: string;
  stack: string | null;
  statusCode: number | null;
  requestId: string | null;
};

export async function persistExecutedActionOutcome({
  actionId,
  status,
  error,
  logger,
}: {
  actionId: string;
  status: ExecutedActionStatus;
  error: PersistedActionError | null;
  logger: Logger;
}) {
  try {
    await prisma.executedAction.update({
      where: { id: actionId },
      data: {
        executionStatus: status,
        executedAt: new Date(),
        executionError: error ?? Prisma.DbNull,
      },
    });
  } catch (persistenceError) {
    logger.error("Failed to persist executed action outcome", {
      actionId,
      executionStatus: status,
      error: persistenceError,
    });
  }
}

export function getPersistedActionError(error: unknown): PersistedActionError {
  const outer = asRecord(error);
  const nested = asRecord(outer?.error);
  const headers = asRecord(outer?.headers);

  return {
    code:
      getString(outer, "code") ||
      getString(nested, "code") ||
      (error instanceof Error ? error.name : "UNKNOWN_ACTION_ERROR"),
    message: truncate(
      getErrorMessage(error) || "Unknown action execution error",
      4000,
    ),
    stack:
      error instanceof Error && error.stack
        ? truncate(error.stack, 12_000)
        : null,
    statusCode:
      getNumber(outer, "statusCode") ||
      getNumber(outer, "status") ||
      getNumber(nested, "statusCode"),
    requestId:
      getString(outer, "requestId") ||
      getString(nested, "requestId") ||
      getString(headers, "request-id") ||
      getString(headers, "client-request-id"),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function getString(
  value: Record<string, unknown> | null,
  key: string,
): string | null {
  const result = value?.[key];
  return typeof result === "string" && result ? result : null;
}

function getNumber(
  value: Record<string, unknown> | null,
  key: string,
): number | null {
  const result = value?.[key];
  return typeof result === "number" && Number.isFinite(result) ? result : null;
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
