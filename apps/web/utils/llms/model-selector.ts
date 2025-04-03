import { env } from "@/env";
import { getModel } from "@/utils/llms/model";
import type { UserAIFields } from "@/utils/llms/types";
import { Model, Provider } from "@/utils/llms/config";

/**
 * Selects the appropriate economy model for high-volume or context-heavy tasks
 * By default, uses a cheaper model like Gemini Flash for tasks that don't require the most powerful LLM
 *
 * Use cases:
 * - Processing large knowledge bases
 * - Analyzing email history
 * - Bulk processing emails
 * - Any task with large context windows where cost efficiency matters
 */
export function getEconomyModel(userAi: UserAIFields) {
  // If specific economy model is configured, use it
  if (
    env.NEXT_PUBLIC_ECONOMY_LLM_PROVIDER &&
    env.NEXT_PUBLIC_ECONOMY_LLM_MODEL
  ) {
    return getModel({
      ...userAi,
      aiProvider: env.NEXT_PUBLIC_ECONOMY_LLM_PROVIDER,
      aiModel: env.NEXT_PUBLIC_ECONOMY_LLM_MODEL,
    });
  }

  // If only provider is specified (without model), use default model for that provider
  if (env.NEXT_PUBLIC_ECONOMY_LLM_PROVIDER) {
    return getModel({
      ...userAi,
      aiProvider: env.NEXT_PUBLIC_ECONOMY_LLM_PROVIDER,
    });
  }

  // Default to Gemini Flash if Google provider is available
  if (env.GOOGLE_API_KEY) {
    return getModel({
      ...userAi,
      aiProvider: Provider.GOOGLE,
      aiModel: Model.GEMINI_2_0_FLASH,
    });
  }

  // Fallback to user's default model if no economy-specific configuration
  return getModel(userAi);
}
