/**
 * Chat completion stream wrapper with Claude Code provider support.
 *
 * This module provides a wrapper around chatCompletionStream that adds
 * support for Claude Code streaming. Import this instead of index.ts
 * when you need Claude Code streaming support.
 *
 * For callers that don't need Claude Code streaming or use tools,
 * continue using chatCompletionStream from index.ts directly.
 */

import type { ModelMessage, Tool, LanguageModelUsage } from "ai";
import type {
  StreamTextOnFinishCallback,
  StreamTextOnStepFinishCallback,
} from "ai";
import { chatCompletionStream as baseChatCompletionStream } from "@/utils/llms/index";
import { getModel, type ModelType } from "@/utils/llms/model";
import { Provider } from "@/utils/llms/config";
import type { UserAIFields } from "@/utils/llms/types";
import { createClaudeCodeStreamText } from "@/utils/llms/claude-code-llm";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("llms/chat-completion-stream");

interface ChatCompletionStreamOptions {
  userAi: UserAIFields;
  modelType?: ModelType;
  messages: ModelMessage[];
  tools?: Record<string, Tool>;
  maxSteps?: number;
  userEmail: string;
  usageLabel: string;
  onFinish?: StreamTextOnFinishCallback<Record<string, Tool>>;
  onStepFinish?: StreamTextOnStepFinishCallback<Record<string, Tool>>;
}

/**
 * Chat completion stream with Claude Code provider support.
 *
 * When Claude Code is the selected provider:
 * - Uses dedicated Claude Code streaming implementation
 * - Requires emailAccountId for session management
 * - Does not support tools (will throw an error)
 *
 * For all other providers:
 * - Delegates to the standard Vercel AI SDK implementation
 */
export async function chatCompletionStream({
  userAi,
  modelType,
  messages,
  tools,
  maxSteps,
  userEmail,
  usageLabel: label,
  onFinish,
  onStepFinish,
}: ChatCompletionStreamOptions) {
  const { provider, modelName, claudeCodeConfig } = getModel(userAi, modelType);

  // Claude Code provider - use dedicated streaming implementation
  if (provider === Provider.CLAUDE_CODE && claudeCodeConfig) {
    logger.trace("Using Claude Code streaming", {
      label,
      model: modelName,
    });

    // Claude Code streaming doesn't support tools yet
    if (tools && Object.keys(tools).length > 0) {
      throw new Error(
        "Claude Code streaming does not support tools yet. " +
          `Feature "${label}" requires ${Object.keys(tools).length} tools. ` +
          "Use a different provider for tool-based features.",
      );
    }

    return createClaudeCodeStreamText({
      emailAccount: { email: userEmail, id: userEmail }, // id not used, email used for sessions
      label,
      config: claudeCodeConfig,
      modelName,
      provider,
      messages,
      onFinish: onFinish
        ? async (result: { text: string; usage: LanguageModelUsage }) => {
            // Adapt to StreamTextOnFinishCallback shape (partial compatibility)
            // @ts-expect-error - Claude Code result shape differs from full AI SDK result
            await onFinish(result);
          }
        : undefined,
    });
  }

  // For non-Claude-Code providers, use the standard implementation
  return baseChatCompletionStream({
    userAi,
    modelType,
    messages,
    tools,
    maxSteps,
    userEmail,
    usageLabel: label,
    onFinish,
    onStepFinish,
  });
}

// Re-export types that callers might need
export type { ChatCompletionStreamOptions };
