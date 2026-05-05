import { env } from "@/env";
import {
  DEFAULT_AI_SENSITIVE_CONTENT_POLICY,
  parseAiSensitiveContentPolicy,
  type AiSensitiveContentPolicy,
} from "@/utils/dlp/sensitive-content";

export function resolveAiSensitiveContentPolicy(
  accountPolicy: string | null | undefined,
): AiSensitiveContentPolicy {
  if (isAiSensitiveContentPolicyLocked()) {
    return getAiSensitiveContentPolicyDefault();
  }

  return accountPolicy
    ? parseAiSensitiveContentPolicy(accountPolicy)
    : getAiSensitiveContentPolicyDefault();
}

export function getAiSensitiveContentPolicyDefault(): AiSensitiveContentPolicy {
  return env.AI_SENSITIVE_CONTENT_POLICY_DEFAULT
    ? parseAiSensitiveContentPolicy(env.AI_SENSITIVE_CONTENT_POLICY_DEFAULT)
    : DEFAULT_AI_SENSITIVE_CONTENT_POLICY;
}

export function isAiSensitiveContentPolicyLocked() {
  return env.AI_SENSITIVE_CONTENT_POLICY_LOCKED;
}
