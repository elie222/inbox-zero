/**
 * Claude Code LLM integration module.
 *
 * This module provides generateText and generateObject implementations
 * that use the Claude Code CLI wrapper service instead of the Vercel AI SDK.
 *
 * Kept separate from index.ts to minimize upstream merge conflicts.
 */

import type { LanguageModelUsage, ModelMessage } from "ai";
import { saveAiUsage } from "@/utils/usage";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ClaudeCodeConfig } from "@/utils/llms/model";
import { createScopedLogger } from "@/utils/logger";
import {
  claudeCodeGenerateText,
  claudeCodeGenerateObject,
  claudeCodeStreamText,
  ClaudeCodeError,
  type ClaudeCodeStreamResult,
} from "@/utils/llms/claude-code";
import {
  getClaudeCodeSession,
  saveClaudeCodeSession,
  getWorkflowGroupFromLabel,
} from "@/utils/redis/claude-code-session";

// Simplified types for Claude Code results - compatible with how callers use generateText/generateObject
// biome-ignore lint/suspicious/noExplicitAny: Complex AI SDK types require flexibility
type ClaudeCodeGenerateTextFn = (...args: any[]) => Promise<any>;
// biome-ignore lint/suspicious/noExplicitAny: Complex AI SDK types require flexibility
type ClaudeCodeGenerateObjectFn = (...args: any[]) => Promise<any>;

const logger = createScopedLogger("llms/claude-code-llm");

const MAX_LOG_LENGTH = 200;

/**
 * Label-to-model overrides for Claude Code provider.
 * Allows specific tasks to use faster/cheaper models (e.g., haiku for classification).
 * Labels not listed here use the default model from config.
 *
 * This enables performance optimization without modifying upstream code -
 * the model selection happens at the provider level based on the task label.
 */
const LABEL_MODEL_OVERRIDES: Record<string, string> = {
  // Classification/extraction tasks - fast model is sufficient
  "Choose rule": "haiku",
  "Args for rule": "haiku",
  "Categorize sender": "haiku",
  "Categorize senders bulk": "haiku",
  "Summarize email": "haiku",
  // Complex/creative tasks use default (sonnet) - no override needed
};

/**
 * Selects the appropriate model based on the task label.
 * Returns label-specific override if defined, otherwise the default model.
 */
function getModelForLabel(label: string, defaultModel?: string): string {
  return LABEL_MODEL_OVERRIDES[label] ?? defaultModel ?? "sonnet";
}

/**
 * Retrieves existing session ID for conversation continuity.
 * Returns undefined on error (graceful degradation).
 */
async function retrieveSessionId({
  userEmail,
  label,
}: {
  userEmail: string;
  label: string;
}): Promise<{ sessionId: string | undefined; workflowGroup: string }> {
  const workflowGroup = getWorkflowGroupFromLabel(label);
  let sessionId: string | undefined;

  try {
    const existingSession = await getClaudeCodeSession({
      userEmail,
      workflowGroup,
    });
    sessionId = existingSession?.sessionId;
  } catch (error) {
    logger.warn("Failed to retrieve Claude Code session", {
      error,
      label,
      workflowGroup,
    });
  }

  return { sessionId, workflowGroup };
}

/**
 * Persists session ID for future calls in the same workflow.
 * Logs warning on error (graceful degradation).
 */
async function persistSessionId({
  userEmail,
  workflowGroup,
  sessionId,
  label,
}: {
  userEmail: string;
  workflowGroup: string;
  sessionId: string;
  label: string;
}): Promise<void> {
  try {
    await saveClaudeCodeSession({
      userEmail,
      workflowGroup: workflowGroup as "report" | "rules" | "clean" | "default",
      sessionId,
    });
  } catch (error) {
    logger.warn("Failed to save Claude Code session", {
      error,
      label,
      workflowGroup,
      sessionId,
    });
  }
}

interface ClaudeCodeLLMOptions {
  emailAccount: Pick<EmailAccountWithAI, "email" | "id">;
  label: string;
  config: ClaudeCodeConfig;
  modelName: string;
  provider: string;
}

/**
 * Creates a generateText function that uses Claude Code CLI.
 * Returns a result compatible with the Vercel AI SDK generateText return type.
 */
export function createClaudeCodeGenerateText(
  options: ClaudeCodeLLMOptions,
): ClaudeCodeGenerateTextFn {
  const { emailAccount, label, config, modelName, provider } = options;

  return async (...args) => {
    const [callOptions] = args;

    // Select model based on task label (allows faster models for simple tasks)
    const effectiveModel = getModelForLabel(label, config.model);
    const effectiveConfig = { ...config, model: effectiveModel };

    logger.trace("Generating text via Claude Code", {
      label,
      model: effectiveModel,
      system: callOptions.system?.slice(0, MAX_LOG_LENGTH),
      prompt:
        typeof callOptions.prompt === "string"
          ? callOptions.prompt.slice(0, MAX_LOG_LENGTH)
          : undefined,
    });

    try {
      const prompt =
        typeof callOptions.prompt === "string"
          ? callOptions.prompt
          : JSON.stringify(callOptions.prompt);

      // Retrieve existing session for conversation continuity
      const { sessionId, workflowGroup } = await retrieveSessionId({
        userEmail: emailAccount.email,
        label,
      });

      const result = await claudeCodeGenerateText(effectiveConfig, {
        system: callOptions.system,
        prompt,
        sessionId,
      });

      // Save the returned sessionId for future calls in this workflow
      await persistSessionId({
        userEmail: emailAccount.email,
        workflowGroup,
        sessionId: result.sessionId,
        label,
      });

      const usage: LanguageModelUsage = {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      };

      await saveAiUsage({
        email: emailAccount.email,
        usage,
        provider,
        model: modelName,
        label,
      });

      // Return a result shape compatible with Vercel AI SDK's GenerateTextResult.
      //
      // Stub values explanation:
      // - toolCalls/toolResults: Empty because Claude Code CLI wrapper doesn't
      //   support tool use in this integration phase. Callers expect arrays.
      // - steps: Empty because we make single-turn requests to the wrapper.
      //   Multi-step agentic loops aren't supported via this provider.
      // - reasoning/reasoningDetails: Claude Code doesn't expose chain-of-thought.
      // - sources/files: Not applicable for this text generation use case.
      //
      // These stubs ensure callers can safely access these properties without
      // null checks, matching how they'd work with other AI SDK providers.
      return {
        text: result.text,
        reasoning: undefined,
        reasoningDetails: [],
        sources: [],
        files: [],
        toolCalls: [],
        toolResults: [],
        finishReason: "stop" as const,
        usage,
        request: {},
        response: {
          id: result.sessionId,
          timestamp: new Date(),
          modelId: modelName,
          headers: {},
          body: undefined,
        },
        warnings: [],
        providerMetadata: undefined,
        experimental_providerMetadata: undefined,
        steps: [],
      };
    } catch (error) {
      if (error instanceof ClaudeCodeError) {
        logger.error("Claude Code error", {
          label,
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  };
}

/**
 * Creates a generateObject function that uses Claude Code CLI.
 * Returns a result compatible with the Vercel AI SDK generateObject return type.
 */
export function createClaudeCodeGenerateObject(
  options: ClaudeCodeLLMOptions,
): ClaudeCodeGenerateObjectFn {
  const { emailAccount, label, config, modelName, provider } = options;

  return async (...args) => {
    const [callOptions] = args;

    // Select model based on task label (allows faster models for simple tasks)
    const effectiveModel = getModelForLabel(label, config.model);
    const effectiveConfig = { ...config, model: effectiveModel };

    logger.trace("Generating object via Claude Code", {
      label,
      model: effectiveModel,
      system: callOptions.system?.slice(0, MAX_LOG_LENGTH),
      prompt:
        typeof callOptions.prompt === "string"
          ? callOptions.prompt.slice(0, MAX_LOG_LENGTH)
          : undefined,
    });

    try {
      const prompt =
        typeof callOptions.prompt === "string"
          ? callOptions.prompt
          : JSON.stringify(callOptions.prompt);

      // Extract schema from options - generateObject requires a schema
      if (!("schema" in callOptions) || !callOptions.schema) {
        throw new Error("Schema is required for generateObject");
      }

      // Retrieve existing session for conversation continuity
      const { sessionId, workflowGroup } = await retrieveSessionId({
        userEmail: emailAccount.email,
        label,
      });

      const result = await claudeCodeGenerateObject(effectiveConfig, {
        system: callOptions.system,
        prompt,
        schema: callOptions.schema,
        sessionId,
      });

      // Save the returned sessionId for future calls in this workflow
      await persistSessionId({
        userEmail: emailAccount.email,
        workflowGroup,
        sessionId: result.sessionId,
        label,
      });

      const usage: LanguageModelUsage = {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: result.usage.totalTokens,
      };

      await saveAiUsage({
        email: emailAccount.email,
        usage,
        provider,
        model: modelName,
        label,
      });

      logger.trace("Claude Code generated object", {
        label,
        result: result.object,
      });

      // Return a result shape compatible with Vercel AI SDK's GenerateObjectResult.
      //
      // Stub values explanation:
      // - rawResponse: Empty headers object; actual HTTP details are abstracted
      //   by the wrapper service and not meaningful to callers.
      // - providerMetadata: Not available from Claude Code CLI wrapper.
      // - toJsonResponse: Convenience method for API routes returning the object.
      //
      // The primary value is `object` which contains the validated, typed result.
      return {
        object: result.object,
        finishReason: "stop" as const,
        usage,
        request: {},
        response: {
          id: result.sessionId,
          timestamp: new Date(),
          modelId: modelName,
          headers: {},
          body: undefined,
        },
        warnings: [],
        providerMetadata: undefined,
        experimental_providerMetadata: undefined,
        rawResponse: { headers: {} },
        toJsonResponse: () => Response.json(result.object),
      };
    } catch (error) {
      if (error instanceof ClaudeCodeError) {
        logger.error("Claude Code error", {
          label,
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  };
}

/**
 * Result type for Claude Code streaming that's compatible with Vercel AI SDK usage.
 * Provides the essential methods used by API routes (toTextStreamResponse).
 */
export interface ClaudeCodeStreamTextResult {
  /** AsyncIterable of text chunks for manual consumption */
  textStream: AsyncIterable<string>;
  /** Promise that resolves to the full accumulated text */
  text: Promise<string>;
  /** Promise that resolves to usage statistics */
  usage: Promise<LanguageModelUsage>;
  /** Convert stream to HTTP Response for API routes */
  toTextStreamResponse(): Response;
}

/**
 * Extracts system message and user prompt from ModelMessage array.
 */
function extractMessagesContent(messages: ModelMessage[]): {
  system: string | undefined;
  prompt: string;
} {
  let system: string | undefined;
  const userParts: string[] = [];

  for (const message of messages) {
    if (message.role === "system") {
      // Extract system message content
      if (typeof message.content === "string") {
        system = message.content;
      } else if (Array.isArray(message.content)) {
        system = message.content
          .filter((part) => part.type === "text")
          .map((part) => (part as { type: "text"; text: string }).text)
          .join("\n");
      }
    } else if (message.role === "user") {
      // Extract user message content
      if (typeof message.content === "string") {
        userParts.push(message.content);
      } else if (Array.isArray(message.content)) {
        const textContent = message.content
          .filter((part) => part.type === "text")
          .map((part) => (part as { type: "text"; text: string }).text)
          .join("\n");
        if (textContent) {
          userParts.push(textContent);
        }
      }
    } else if (message.role === "assistant") {
      // Include assistant messages as context if present
      if (typeof message.content === "string") {
        userParts.push(`Assistant: ${message.content}`);
      }
    }
  }

  return {
    system,
    prompt: userParts.join("\n\n"),
  };
}

/**
 * Creates a streaming text function that uses Claude Code CLI.
 * Returns a result compatible with how Vercel AI SDK streams are used in API routes.
 */
export async function createClaudeCodeStreamText({
  emailAccount,
  label,
  config,
  modelName,
  provider,
  messages,
  onFinish,
}: {
  emailAccount: Pick<EmailAccountWithAI, "email" | "id">;
  label: string;
  config: ClaudeCodeConfig;
  modelName: string;
  provider: string;
  messages: ModelMessage[];
  onFinish?: (result: {
    text: string;
    usage: LanguageModelUsage;
  }) => Promise<void>;
}): Promise<ClaudeCodeStreamTextResult> {
  // Select model based on task label (allows faster models for simple tasks)
  const effectiveModel = getModelForLabel(label, config.model);
  const effectiveConfig = { ...config, model: effectiveModel };

  // Extract system and prompt from messages
  const { system, prompt } = extractMessagesContent(messages);

  logger.trace("Starting Claude Code stream", {
    label,
    model: effectiveModel,
    hasSystem: !!system,
    promptLength: prompt.length,
  });

  // Retrieve existing session for conversation continuity
  const { sessionId, workflowGroup } = await retrieveSessionId({
    userEmail: emailAccount.email,
    label,
  });

  // Start the stream
  const streamResult = await claudeCodeStreamText(effectiveConfig, {
    system,
    prompt,
    sessionId,
  });

  // Create an async iterable from the ReadableStream
  const textStream: AsyncIterable<string> = {
    [Symbol.asyncIterator]() {
      const reader = streamResult.textStream.getReader();
      return {
        async next() {
          const { done, value } = await reader.read();
          if (done) {
            return { done: true, value: undefined };
          }
          return { done: false, value };
        },
      };
    },
  };

  // Transform usage to LanguageModelUsage format
  const usagePromise = streamResult.usage.then((usage) => ({
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
  }));

  // Handle session persistence and usage tracking when stream completes
  const textPromise = streamResult.text.then(async (text) => {
    // Persist session
    const resolvedSessionId = await streamResult.sessionId;
    await persistSessionId({
      userEmail: emailAccount.email,
      workflowGroup,
      sessionId: resolvedSessionId,
      label,
    });

    // Track usage
    try {
      const usage = await usagePromise;
      await saveAiUsage({
        email: emailAccount.email,
        usage,
        provider,
        model: modelName,
        label,
      });

      // Call onFinish callback if provided
      if (onFinish) {
        await onFinish({ text, usage });
      }
    } catch (error) {
      logger.error("Error saving usage or calling onFinish", {
        label,
        error,
      });
    }

    return text;
  });

  return {
    textStream,
    text: textPromise,
    usage: usagePromise,
    toTextStreamResponse(): Response {
      // Create a new ReadableStream that encodes text chunks for HTTP response
      const encoder = new TextEncoder();
      const responseStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            const reader = streamResult.textStream.getReader();
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              controller.enqueue(encoder.encode(value));
            }
            controller.close();
          } catch (error) {
            controller.error(error);
          }
        },
      });

      return new Response(responseStream, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Transfer-Encoding": "chunked",
          "X-Content-Type-Options": "nosniff",
        },
      });
    },
  };
}
