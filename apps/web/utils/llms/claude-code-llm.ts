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

      const result = await claudeCodeGenerateText(config, {
        system: callOptions.system,
        prompt,
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

      // Return a compatible result shape
      // Note: Claude Code doesn't support tools in this phase
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

      const result = await claudeCodeGenerateObject(config, {
        system: callOptions.system,
        prompt,
        schema: callOptions.schema,
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

      // Return a compatible result shape
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
