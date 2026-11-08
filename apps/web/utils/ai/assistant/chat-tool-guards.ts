import {
  asSchema,
  jsonSchema,
  type ModelMessage,
  type ToolExecutionOptions,
  type ToolResultPart,
  type ToolSet,
} from "ai";
import isEqual from "lodash/isEqual";
import { getToolFailureMessage } from "@/utils/ai/assistant/chat-response-guard";
import { hideToolErrorFromUser } from "@/utils/ai/assistant/tool-error-visibility";

const MAX_REPORTED_ISSUES = 3;

// Wraps every chat tool so that mistakes the model can fix come back as
// readable tool results instead of opaque SDK errors or repeated side effects.
export function guardChatTools<TTools extends ToolSet>(tools: TTools): TTools {
  const guardedTools: ToolSet = { ...tools };

  for (const [toolName, toolDefinition] of Object.entries(tools)) {
    const { execute } = toolDefinition;
    if (!execute || !toolDefinition.inputSchema) continue;

    const schema = asSchema(toolDefinition.inputSchema);

    guardedTools[toolName] = {
      ...toolDefinition,
      // The SDK validates input before execute and hands the model a raw dump
      // of the failure. Keep the JSON schema the model sees, but defer
      // validation to execute so the model gets a message it can act on.
      inputSchema: jsonSchema(() => schema.jsonSchema, {
        validate: (value) => ({ success: true, value }),
      }),
      execute: async (input: unknown, options: ToolExecutionOptions<never>) => {
        const previousFailure = findPreviousFailureInTurn({
          toolName,
          input,
          messages: options.messages,
        });
        if (previousFailure) {
          return hideToolErrorFromUser({
            error: `This exact ${toolName} call already failed earlier in this response: ${previousFailure} Do not repeat it unchanged. Change the input, try a different approach, or tell the user why it could not be done.`,
          });
        }

        const validation = schema.validate
          ? await schema.validate(input)
          : { success: true as const, value: input };
        if (!validation.success) {
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

export function formatToolInputError(toolName: string, error: unknown) {
  const issues = getValidationIssues(error);
  if (!issues.length) return `Invalid ${toolName} input`;

  const details = issues
    .slice(0, MAX_REPORTED_ISSUES)
    .map(formatValidationIssue)
    .join("; ");

  return `Invalid ${toolName} input: ${details}`;
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

  for (const message of turnMessages) {
    if (message.role !== "tool") continue;
    for (const part of message.content) {
      if (part.type !== "tool-result" || !matchingCallIds.has(part.toolCallId))
        continue;

      const failure = getToolResultFailure(part.output);
      if (failure) return failure;
    }
  }

  return null;
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
