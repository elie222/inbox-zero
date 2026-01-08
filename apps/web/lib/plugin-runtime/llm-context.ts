import type { z } from "zod";
import { createGenerateText, createGenerateObject } from "@/utils/llms";
import { getModel, type ModelType } from "@/utils/llms/model";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("plugin-runtime/llm");

/**
 * LLM tier options for plugins
 * - default: standard model for balanced performance/cost
 * - economy: cheaper model for high-volume or context-heavy tasks
 * - chat: fast model optimized for conversational tasks
 */
type PluginLLMTier = "default" | "economy" | "chat";

interface PluginGenerateTextOptions {
  prompt: string;
  system?: string;
}

interface PluginGenerateObjectOptions<T extends z.ZodType> {
  prompt: string;
  system?: string;
  schema: T;
}

interface PluginGenerateObjectResult<T> {
  object: T;
}

interface PluginLLM {
  generateText: (options: PluginGenerateTextOptions) => Promise<string>;
  generateObject: <T extends z.ZodType>(
    options: PluginGenerateObjectOptions<T>,
  ) => Promise<PluginGenerateObjectResult<z.infer<T>>>;
}

interface PluginLLMError extends Error {
  code: "llm-error";
  cause?: unknown;
}

function createPluginLLMError(
  message: string,
  cause?: unknown,
): PluginLLMError {
  const error = new Error(message) as PluginLLMError;
  error.code = "llm-error";
  error.cause = cause;
  return error;
}

/**
 * Creates a sandboxed LLM interface for plugins
 *
 * The wrapper:
 * - Uses the plugin's llm.tier from plugin.json to select the appropriate model
 * - Tracks usage with label `plugin:{pluginId}` for billing attribution
 * - Handles errors gracefully with plugin-specific error types
 */
export function createPluginLLM(
  emailAccount: EmailAccountWithAI,
  pluginId: string,
  llmTier: PluginLLMTier = "default",
): PluginLLM {
  const modelType: ModelType = llmTier;
  const modelOptions = getModel(emailAccount.user, modelType);
  const usageLabel = `plugin:${pluginId}`;

  logger.info("Creating plugin LLM", {
    pluginId,
    llmTier,
    provider: modelOptions.provider,
    model: modelOptions.modelName,
  });

  return {
    async generateText(options: PluginGenerateTextOptions): Promise<string> {
      try {
        const generate = createGenerateText({
          emailAccount,
          label: usageLabel,
          modelOptions,
        });

        const result = await generate({
          ...modelOptions,
          prompt: options.prompt,
          system: options.system,
        });

        return result.text;
      } catch (error) {
        logger.error("Plugin generateText failed", {
          pluginId,
          error,
        });
        throw createPluginLLMError(
          `LLM text generation failed for plugin ${pluginId}`,
          error,
        );
      }
    },

    async generateObject<T extends z.ZodType>(
      options: PluginGenerateObjectOptions<T>,
    ): Promise<PluginGenerateObjectResult<z.infer<T>>> {
      try {
        const generate = createGenerateObject({
          emailAccount,
          label: usageLabel,
          modelOptions,
        });

        const result = await generate({
          ...modelOptions,
          prompt: options.prompt,
          system: options.system,
          schema: options.schema,
        });

        return { object: result.object as z.infer<T> };
      } catch (error) {
        logger.error("Plugin generateObject failed", {
          pluginId,
          error,
        });
        throw createPluginLLMError(
          `LLM object generation failed for plugin ${pluginId}`,
          error,
        );
      }
    },
  };
}

export type {
  PluginLLM,
  PluginLLMTier,
  PluginGenerateTextOptions,
  PluginGenerateObjectOptions,
};
