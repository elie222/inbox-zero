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
  return getFailedToolCalls(message).length > 0 ? TOOL_FAILURE_WARNING : null;
}

/**
 * Every tool call in this turn that failed, with the reason. Used both to
 * decide whether to warn the user and to log what actually went wrong.
 *
 * A later successful call to the same tool does NOT suppress an earlier
 * failure. Tool names are not unique per target -- one turn can call
 * `updateRule` for two different rules -- so treating a later success as a
 * repair would hide a genuine failure behind an unrelated one that worked,
 * which is exactly the silent-failure mode this guard exists to catch.
 * Over-warning is the safe direction here.
 */
export function getFailedToolCalls(
  message:
    | {
        parts?: unknown[];
      }
    | null
    | undefined,
): { toolName: string; error: string }[] {
  const parts = message?.parts;
  if (!parts?.length) return [];

  return parts
    .filter(isRecord)
    .map(toToolPart)
    .filter((part): part is ToolPart => part !== null)
    .filter(isToolPartFailure)
    .map((part) => ({
      toolName: part.toolName,
      error: getToolPartFailureReason(part),
    }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ToolPart = {
  toolName: string;
  state: string | undefined;
  output: unknown;
  errorText: string | undefined;
};

/**
 * Normalizes the two shapes a tool call can take. A call the SDK could not
 * parse against its schema arrives as `dynamic-tool` rather than
 * `tool-<name>`, so matching only the latter misses every schema rejection.
 */
function toToolPart(part: Record<string, unknown>): ToolPart | null {
  if (typeof part.type !== "string") return null;

  const state = typeof part.state === "string" ? part.state : undefined;
  const errorText =
    typeof part.errorText === "string" ? part.errorText : undefined;

  if (part.type === "dynamic-tool") {
    if (typeof part.toolName !== "string") return null;
    return { toolName: part.toolName, state, output: part.output, errorText };
  }

  if (!part.type.startsWith("tool-")) return null;

  return {
    toolName: part.type.slice("tool-".length),
    state,
    output: part.output,
    errorText,
  };
}

function getToolPartFailureReason(part: ToolPart): string {
  if (part.state === "output-error") {
    return part.errorText ?? "Tool call rejected";
  }
  return getUserVisibleToolFailureMessage(part.output) ?? "Operation failed";
}

function isToolPartFailure(part: ToolPart) {
  // "output-error" carries an errorText and no output at all, so the
  // output-based checks below can never see it.
  if (part.state === "output-error") return true;
  return Boolean(getUserVisibleToolFailureMessage(part.output));
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
