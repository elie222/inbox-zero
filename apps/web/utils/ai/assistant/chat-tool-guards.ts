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
const EMAIL_ID_FIELDS = ["threadId", "threadIds", "messageId", "messageIds"];
const EMAIL_ID_KEY = /(?:thread|message)Ids?$/i;
const THREAD_ID_KEY = /threadIds?$/i;
const TEXT_TOKEN_SEPARATOR = /[\s"'`<>,;:()[\]{}|]+/;

// Wraps every chat tool so that mistakes the model can fix come back as
// readable tool results instead of opaque SDK errors or repeated side effects.
export function guardChatTools<TTools extends ToolSet>(
  tools: TTools,
  logger: Logger,
  { skipEmailIdCheck = [] }: { skipEmailIdCheck?: string[] } = {},
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

        const idProblems = skipEmailIdCheck.includes(toolName)
          ? null
          : findEmailIdProblems(input, options.messages);
        if (idProblems) {
          logger.warn("Rejected chat tool call with unknown email IDs", {
            toolName,
          });
          return hideToolErrorFromUser({
            error: formatEmailIdProblems(toolName, idProblems),
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

// Models mis-copy long provider IDs. Only IDs that already reached the model
// in this chat can be real, so anything else is a transcription error.
// Compared exactly: an ID with stray whitespace would reach the provider as-is.
function findEmailIdProblems(input: unknown, messages: ModelMessage[]) {
  if (!isObject(input)) return null;

  const idsToCheck: Array<{ field: string; label: string; id: string }> = [];
  for (const field of EMAIL_ID_FIELDS) {
    const value = (input as Record<string, unknown>)[field];
    if (typeof value === "string") {
      idsToCheck.push({ field, label: field, id: value });
    }
    if (Array.isArray(value)) {
      value.forEach((id, index) => {
        if (typeof id === "string") {
          idsToCheck.push({ field, label: `${field}[${index}]`, id });
        }
      });
    }
  }
  if (!idsToCheck.length) return null;

  const { seenIds, threadIds, messageIds } = collectSeenIds(messages);
  const unseen = idsToCheck.filter(({ id }) => !seenIds.has(id));
  // A tool result listed this ID only as a message, so it was passed where a
  // thread ID belongs. Archive and trash treat an unknown thread as already
  // handled, so this would otherwise "succeed" without changing anything.
  const messageIdsAsThreads = idsToCheck.filter(
    ({ field, id }) =>
      field.startsWith("threadId") && messageIds.has(id) && !threadIds.has(id),
  );
  if (!unseen.length && !messageIdsAsThreads.length) return null;

  return { unseen, messageIdsAsThreads };
}

function formatEmailIdProblems(
  toolName: string,
  problems: NonNullable<ReturnType<typeof findEmailIdProblems>>,
) {
  const sentences = [`${toolName} was not run.`];
  if (problems.unseen.length) {
    sentences.push(
      `${problems.unseen.map(({ label }) => label).join(", ")} did not appear in any earlier tool result or user message in this chat, so it is likely mistyped. Copy IDs exactly from an earlier result, or search again to get them.`,
    );
  }
  if (problems.messageIdsAsThreads.length) {
    sentences.push(
      `${problems.messageIdsAsThreads.map(({ label }) => label).join(", ")} is a messageId, not a threadId. Use the threadId from the same result.`,
    );
  }
  return sentences.join(" ");
}

function collectSeenIds(messages: ModelMessage[]) {
  const seenIds = new Set<string>();
  const threadIds = new Set<string>();
  const messageIds = new Set<string>();
  const addText = (text: string) => {
    for (const token of text.split(TEXT_TOKEN_SEPARATOR)) {
      if (!token) continue;
      seenIds.add(token);
      seenIds.add(token.replace(/\.+$/, ""));
    }
  };
  const addId = (key: string, id: string) => {
    seenIds.add(id);
    if (THREAD_ID_KEY.test(key)) threadIds.add(id);
    else messageIds.add(id);
  };
  // Only ID fields count: free text in a result, like an email body, could
  // contain an ID-shaped token that was never an ID.
  const addKeyedIds = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(addKeyedIds);
      return;
    }
    if (!isObject(value)) return;
    for (const [key, entry] of Object.entries(value)) {
      if (!EMAIL_ID_KEY.test(key)) {
        addKeyedIds(entry);
      } else if (typeof entry === "string") {
        addId(key, entry);
      } else if (Array.isArray(entry)) {
        for (const id of entry) if (typeof id === "string") addId(key, id);
      }
    }
  };

  for (const message of messages) {
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result" || getToolResultFailure(part.output))
          continue;
        if (part.output.type === "json") addKeyedIds(part.output.value);
      }
      continue;
    }

    // User and system messages carry hidden email context and UI notes. The
    // model's own text keeps IDs from results that compaction later dropped.
    if (typeof message.content === "string") addText(message.content);
    else
      for (const part of message.content) {
        if (part.type === "text") addText(part.text);
      }
  }

  return { seenIds, threadIds, messageIds };
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

      const failure = getToolResultFailure(part.output);
      if (!matchingCallIds.has(part.toolCallId)) {
        if (failureCount && !failure) recoveredSinceFailure = true;
        continue;
      }
      if (!failure || isRetryableFailure(part.output)) continue;

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
