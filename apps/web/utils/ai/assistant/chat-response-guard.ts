const TOOL_FAILURE_WARNING =
  "Some tool calls failed during this request. Review the failed action cards in this message before relying on the summary.";

const FAILURE_ACKNOWLEDGMENT_PATTERN =
  /\b(could not|did not|failed to|nothing changed|not completed|partially completed|partial completion|unable to|was not changed)\b/i;

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

function getTextContent(part: unknown) {
  if (!isRecord(part)) return null;
  if (part.type !== "text" || typeof part.text !== "string") return null;
  return part.text;
}

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

  const text = parts
    .map(getTextContent)
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();

  if (text && FAILURE_ACKNOWLEDGMENT_PATTERN.test(text)) {
    return null;
  }

  return TOOL_FAILURE_WARNING;
}
