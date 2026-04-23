import { isToolErrorHiddenFromUser } from "./tool-error-visibility";

const TOOL_FAILURE_WARNING =
  "Some tool calls failed during this request. Review the failed action cards in this message before relying on the summary.";

export function getToolFailureWarning(
  message:
    | {
        parts?: unknown[];
      }
    | null
    | undefined,
) {
  const parts = message?.parts;
  if (!parts?.length) return null;

  return parts.some((part) => {
    if (!isRecord(part)) return false;
    if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
      return false;
    }

    return Boolean(getUserVisibleToolFailureMessage(part.output));
  })
    ? TOOL_FAILURE_WARNING
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getUserVisibleToolFailureMessage(output: unknown) {
  if (isToolErrorHiddenFromUser(output)) return null;

  const failureMessage = getToolFailureMessage(output);
  return failureMessage;
}

function getToolFailureMessage(output: unknown): string | null {
  if (!isRecord(output)) return null;

  if ("error" in output) {
    return toMessageString(output.error);
  }

  if (output.success === false) {
    return (
      toMessageString(output.message) ??
      toMessageString(output.reason) ??
      toMessageString(output.error) ??
      "Operation failed"
    );
  }

  return null;
}

function toMessageString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) return value;
  if (
    isRecord(value) &&
    "message" in value &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  ) {
    return value.message;
  }
  return null;
}
