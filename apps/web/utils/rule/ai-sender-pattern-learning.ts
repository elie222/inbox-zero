import { env } from "@/env";
import type { ModelType } from "@/utils/llms/model";
import type { UserAIFields } from "@/utils/llms/types";

/**
 * Whether to write new AI-source sender-pattern caches.
 * Matching existing patterns and user/label corrections are unaffected.
 */
export function shouldLearnAiSenderPatterns({
  user,
  modelType = "default",
}: {
  user?: Pick<UserAIFields, "aiProvider" | "aiModel"> | null;
  modelType?: ModelType;
} = {}): boolean {
  if (env.AI_SENDER_PATTERN_LEARNING_ENABLED === false) return false;
  return !usesJevDecisionModel({ user, modelType });
}

function usesJevDecisionModel({
  user,
  modelType,
}: {
  user?: Pick<UserAIFields, "aiProvider" | "aiModel"> | null;
  modelType: ModelType;
}): boolean {
  if (user?.aiProvider) {
    return isJevModelName(user.aiModel) || isJevModelName(user.aiProvider);
  }

  return isJevModelName(getDeploymentModelList(modelType));
}

function getDeploymentModelList(modelType: ModelType): string | undefined {
  switch (modelType) {
    case "economy":
      return env.ECONOMY_LLMS ?? env.DEFAULT_LLMS;
    case "nano":
      return env.NANO_LLMS ?? env.ECONOMY_LLMS ?? env.DEFAULT_LLMS;
    case "chat":
      return env.CHAT_LLMS ?? env.DEFAULT_LLMS;
    case "draft":
      return env.DRAFT_LLMS ?? env.DEFAULT_LLMS;
    default:
      return env.DEFAULT_LLMS;
  }
}

export function isJevModelName(value: string | null | undefined): boolean {
  if (!value) return false;
  return /(^|[/:,~\s-])jev(?=$|[/:,\s.-])/i.test(value);
}
