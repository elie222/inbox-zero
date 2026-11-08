import {
  asSchema,
  jsonSchema,
  type ModelMessage,
  type ToolResultPart,
  type ToolSet,
} from "ai";
import isEqual from "lodash/isEqual";
import type { Logger } from "@/utils/logger";
import { getToolFailureMessage } from "@/utils/ai/assistant/chat-response-guard";
import { hideToolErrorFromUser } from "@/utils/ai/assistant/tool-error-visibility";

const MAX_REPORTED_ISSUES = 3;

// Wraps every chat tool so that mistakes the model can fix come back as
// readable tool results instead of opaque SDK errors or repeated side effects.
export function guardChatTools<TTools extends ToolSet>(
  tools: TTools,
  logger: Logger,
): TTools {
  const guardedTools: ToolSet = { ...tools };

  for (const [toolName, toolDefinition] of Object.entries(tools)) {
    const { execute } = toolDefinition;
    if (!execute || !toolDefinition.inputSchema) continue;

    const schema = asSchema(toolDefinition.inputSchema);
    const validate = async (value: unknown) =>
      schema.validate
        ? await schema.validate(value)
        : { success: true as const, value };
    const invalidInputErrors = new WeakMap<object, unknown>();
    const validatedInputs = new WeakSet<object>();

    guardedTools[toolName] = {
      ...toolDefinition,
      // A failed SDK validation hands the model a raw dump of the schema
      // error. Keep the JSON schema the model sees, but let invalid input
      // through to execute so it can return a message the model can act on.
      // Valid input is still replaced by its parsed value, because the SDK
      // stores it as the call's input and later flows replay it.
      inputSchema: jsonSchema(() => schema.jsonSchema, {
        validate: async (value) => {
          const result = await validate(value);
          if (result.success) {
            if (isObject(result.value)) validatedInputs.add(result.value);
            return result;
          }
          if (isObject(value)) invalidInputErrors.set(value, result.error);
          return { success: true, value };
        },
      }),
      execute: async (
        input: unknown,
        options: Parameters<NonNullable<typeof execute>>[1],
      ) => {
        const getValidation = async (value: unknown) => {
          if (isObject(value) && invalidInputErrors.has(value)) {
            return {
              success: false as const,
              error: invalidInputErrors.get(value),
            };
          }
          if (isObject(value) && validatedInputs.has(value)) {
            return { success: true as const, value };
          }
          return validate(value);
        };

        const previousFailure = findPreviousFailureInTurn({
          toolName,
          input,
          messages: options.messages,
        });
        if (previousFailure) {
          logger.warn("Blocked repeat of a failed chat tool call", {
            toolName,
          });
          return hideToolErrorFromUser({
            error: `This exact ${toolName} call already failed earlier in this response: ${previousFailure} Do not repeat it unchanged. Change the input, try a different approach, or tell the user why it could not be done.`,
          });
        }

        const validation = await getValidation(input);
        if (!validation.success) {
          logger.warn("Invalid chat tool input", { toolName });
          logger.trace("Invalid chat tool input details", {
            toolName,
            error: validation.error,
          });
          return hideToolErrorFromUser({
            error: formatToolInputError(toolName, validation.error),
          });
        }

        return execute.call(toolDefinition, validation.value, options);
      },
    };
  }

  return guardedTools as TTools;
}

function formatToolInputError(toolName: string, error: unknown) {
  const issues = getValidationIssues(error);
  if (!issues.length) return `Invalid ${toolName} input`;

  const details = issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map(formatValidationIssue)
    .join("; ");

  return `Invalid ${toolName} input: ${details}`;
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function findPreviousFailureInTurn({
  toolName,
  input,
  messages,
}: {
  toolName: string;
  input: unknown;
  messages: ModelMessage[];
}) {
  const turnStart = messages.findLastIndex(
    (message) => message.role === "user",
  );
  const turnMessages = messages.slice(turnStart + 1);

  const matchingCallIds = new Set<string>();
  for (const message of turnMessages) {
    if (message.role !== "assistant" || typeof message.content === "string") {
      continue;
    }
    for (const part of message.content) {
      if (
        part.type === "tool-call" &&
        part.toolName === toolName &&
        isEqual(part.input, input)
      ) {
        matchingCallIds.add(part.toolCallId);
      }
    }
  }
  if (!matchingCallIds.size) return null;

  // A failed call may be repeated once after another tool call succeeds, since
  // that is how the model recovers (refreshing stale rule state, creating a
  // missing label). A second identical failure is always final.
  let firstFailure: string | null = null;
  let failureCount = 0;
  let recoveredSinceFailure = false;
  for (const message of turnMessages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result") continue;

      const failure = isRetryableFailure(part.output)
        ? null
        : getToolResultFailure(part.output);
      if (!matchingCallIds.has(part.toolCallId)) {
        if (failureCount && !failure) recoveredSinceFailure = true;
        continue;
      }
      if (!failure) continue;

      firstFailure ??= failure;
      failureCount++;
      recoveredSinceFailure = false;
    }
  }

  if (!failureCount) return null;
  if (failureCount === 1 && recoveredSinceFailure) return null;
  return firstFailure;
}

// Some tools (such as Gmail search) flag transient failures as retryable;
// repeating those unchanged is fine.
function isRetryableFailure(output: ToolResultPart["output"]) {
  if (output.type !== "json" || !isObject(output.value)) return false;
  const value = output.value as Record<string, unknown>;
  const feedback = value.searchFeedback;
  return (
    value.retryable === true ||
    (isObject(feedback) &&
      (feedback as Record<string, unknown>).retryable === true)
  );
}

function getToolResultFailure(output: ToolResultPart["output"]) {
  if (output.type === "error-text") return output.value;
  if (output.type === "error-json") return JSON.stringify(output.value);
  if (output.type === "json") return getToolFailureMessage(output.value);
  return null;
}

type ValidationIssue = {
  code?: string;
  path?: PropertyKey[];
  message?: string;
  keys?: string[];
};

function getValidationIssues(error: unknown): ValidationIssue[] {
  if (
    typeof error === "object" &&
    error !== null &&
    "issues" in error &&
    Array.isArray(error.issues)
  ) {
    return error.issues as ValidationIssue[];
  }
  return [];
}

function formatValidationIssue(issue: ValidationIssue) {
  if (issue.code === "unrecognized_keys") {
    const firstKey = issue.keys?.[0];
    return firstKey ? `unsupported field "${firstKey}"` : "unsupported fields";
  }

  const field = (issue.path ?? []).map(String).join(".");
  return field ? `${field} ${issue.message}` : (issue.message ?? "invalid");
}
