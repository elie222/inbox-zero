export const CLAUDE_CODE_MCP_SERVER_NAME = "inboxzero";

const CLAUDE_CODE_MCP_TOOL_PREFIX = `mcp__${CLAUDE_CODE_MCP_SERVER_NAME}__`;
const TOOL_PART_PREFIX = "tool-";

type ToolNamedValue = {
  toolName?: unknown;
};

type StepLike = {
  toolCalls?: unknown;
  toolResults?: unknown;
  [key: string]: unknown;
};

type StepResultLike = {
  steps?: unknown;
  toolCalls?: unknown;
  toolResults?: unknown;
  [key: string]: unknown;
};

type ToolPartLike = {
  type?: unknown;
  [key: string]: unknown;
};

export function getClaudeCodeMcpToolName(toolName: string) {
  return `${CLAUDE_CODE_MCP_TOOL_PREFIX}${toolName}`;
}

export function getOriginalClaudeCodeToolName(toolName: string) {
  return toolName.startsWith(CLAUDE_CODE_MCP_TOOL_PREFIX)
    ? toolName.slice(CLAUDE_CODE_MCP_TOOL_PREFIX.length)
    : toolName;
}

export function normalizeClaudeCodeToolPart<TPart>(part: TPart): TPart {
  if (!isToolPartLike(part) || typeof part.type !== "string") return part;
  if (!part.type.startsWith(TOOL_PART_PREFIX)) return part;

  const toolName = part.type.slice(TOOL_PART_PREFIX.length);
  const originalToolName = getOriginalClaudeCodeToolName(toolName);

  if (originalToolName === toolName) return part;

  return {
    ...part,
    type: `${TOOL_PART_PREFIX}${originalToolName}`,
  };
}

export function normalizeClaudeCodeToolNamesInStep<TStep>(step: TStep): TStep {
  if (!isStepLike(step)) return step;

  return {
    ...step,
    toolCalls: normalizeToolNamedValues(step.toolCalls),
    toolResults: normalizeToolNamedValues(step.toolResults),
  };
}

export function normalizeClaudeCodeToolNamesInStepResult<TResult>(
  result: TResult,
): TResult {
  if (!isStepResultLike(result)) return result;

  return {
    ...result,
    steps: Array.isArray(result.steps)
      ? result.steps.map(normalizeClaudeCodeToolNamesInStep)
      : result.steps,
    toolCalls: normalizeToolNamedValues(result.toolCalls),
    toolResults: normalizeToolNamedValues(result.toolResults),
  };
}

function normalizeToolNamedValues(value: unknown) {
  if (!Array.isArray(value)) return value;

  return value.map((item) => {
    if (!isToolNamedValue(item) || typeof item.toolName !== "string") {
      return item;
    }

    const toolName = getOriginalClaudeCodeToolName(item.toolName);
    return toolName === item.toolName ? item : { ...item, toolName };
  });
}

function isToolPartLike(value: unknown): value is ToolPartLike {
  return typeof value === "object" && value !== null;
}

function isStepLike(value: unknown): value is StepLike {
  return typeof value === "object" && value !== null;
}

function isStepResultLike(value: unknown): value is StepResultLike {
  return typeof value === "object" && value !== null;
}

function isToolNamedValue(value: unknown): value is ToolNamedValue {
  return typeof value === "object" && value !== null && "toolName" in value;
}
