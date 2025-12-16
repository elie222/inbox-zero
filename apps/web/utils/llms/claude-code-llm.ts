/**
 * Claude Code LLM integration module.
 *
 * This module provides generateText and generateObject implementations
 * that use the Claude Code CLI wrapper service instead of the Vercel AI SDK.
 *
 * Kept separate from index.ts to minimize upstream merge conflicts.
 */

import type { LanguageModelUsage } from "ai";
import { saveAiUsage } from "@/utils/usage";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ClaudeCodeConfig } from "@/utils/llms/model";
import { createScopedLogger } from "@/utils/logger";
import {
  claudeCodeGenerateText,
  claudeCodeGenerateObject,
  ClaudeCodeError,
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

    logger.trace("Generating text via Claude Code", {
      label,
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

      // Determine workflow group for session scoping
      const workflowGroup = getWorkflowGroupFromLabel(label);

      // Try to retrieve existing session for conversation continuity
      let sessionId: string | undefined;
      try {
        const existingSession = await getClaudeCodeSession({
          emailAccountId: emailAccount.id,
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

      const result = await claudeCodeGenerateText(config, {
        system: callOptions.system,
        prompt,
        sessionId,
      });

      // Save the returned sessionId for future calls in this workflow
      try {
        await saveClaudeCodeSession({
          emailAccountId: emailAccount.id,
          workflowGroup,
          sessionId: result.sessionId,
        });
      } catch (error) {
        logger.warn("Failed to save Claude Code session", {
          error,
          label,
          workflowGroup,
        });
      }

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

    logger.trace("Generating object via Claude Code", {
      label,
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

      // Determine workflow group for session scoping
      const workflowGroup = getWorkflowGroupFromLabel(label);

      // Try to retrieve existing session for conversation continuity
      let sessionId: string | undefined;
      try {
        const existingSession = await getClaudeCodeSession({
          emailAccountId: emailAccount.id,
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

      const result = await claudeCodeGenerateObject(config, {
        system: callOptions.system,
        prompt,
        schema: callOptions.schema,
        sessionId,
      });

      // Save the returned sessionId for future calls in this workflow
      try {
        await saveClaudeCodeSession({
          emailAccountId: emailAccount.id,
          workflowGroup,
          sessionId: result.sessionId,
        });
      } catch (error) {
        logger.warn("Failed to save Claude Code session", {
          error,
          label,
          workflowGroup,
        });
      }

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
