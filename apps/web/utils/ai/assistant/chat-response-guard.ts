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

  const hasToolError = parts.some(isToolPartWithError);
  if (!hasToolError) return null;

  return TOOL_FAILURE_WARNING;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isToolPartWithError(part: unknown) {
  if (!isRecord(part)) return false;

  if (typeof part.type !== "string" || !part.type.startsWith("tool-")) {
    return false;
  }

  return isRecord(part.output) && typeof part.output.error === "string";
}
