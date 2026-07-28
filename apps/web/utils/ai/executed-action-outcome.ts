import { Prisma } from "@/generated/prisma/client";
import {
  ActionType,
  type ExecutedActionStatus,
} from "@/generated/prisma/enums";
import { getErrorMessage } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

type ActionExecutionError = {
  code: string;
  message: string;
  stack: string | null;
  statusCode: number | null;
  requestId: string | null;
};

const ACTION_RESULT_FAILURE_TYPES = new Set<ActionType>([
  ActionType.DRAFT_MESSAGING_CHANNEL,
  ActionType.NOTIFY_MESSAGING_CHANNEL,
  ActionType.NOTIFY_SENDER,
]);

export async function persistExecutedActionOutcome({
  actionId,
  status,
  error,
  logger,
}: {
  actionId: string;
  status: ExecutedActionStatus;
  error: ActionExecutionError | null;
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

export function getActionResultError(
  actionType: ActionType,
  actionResult: unknown,
): ActionExecutionError | null {
  if (!ACTION_RESULT_FAILURE_TYPES.has(actionType)) return null;

  if (
    !actionResult ||
    typeof actionResult !== "object" ||
    !("success" in actionResult) ||
    actionResult.success !== false
  ) {
    return null;
  }

  const code =
    "errorCode" in actionResult && typeof actionResult.errorCode === "string"
      ? actionResult.errorCode
      : getUnknownActionFailureCode(actionType);

  let message = "Action reported failure";
  if (
    "errorMessage" in actionResult &&
    typeof actionResult.errorMessage === "string"
  ) {
    message = actionResult.errorMessage;
  } else if (
    "error" in actionResult &&
    typeof actionResult.error === "string"
  ) {
    message = actionResult.error;
  }

  return {
    code,
    message,
    stack: null,
    statusCode: null,
    requestId: null,
  };
}

export function normalizeActionExecutionError(
  error: unknown,
): ActionExecutionError {
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

function getUnknownActionFailureCode(actionType: ActionType) {
  return actionType === ActionType.NOTIFY_SENDER
    ? "UNKNOWN_NOTIFY_FAILURE"
    : "UNKNOWN_MESSAGING_FAILURE";
}
