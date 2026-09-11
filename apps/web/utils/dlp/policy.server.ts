import { env } from "@/env";
import {
  DEFAULT_SENSITIVE_DATA_POLICY,
  parseSensitiveDataPolicy,
  type SensitiveDataPolicy,
} from "@/utils/dlp/sensitive-content";

export function resolveSensitiveDataPolicy(
  accountPolicy: string | null | undefined,
): SensitiveDataPolicy {
  if (isSensitiveDataPolicyLocked()) {
    return getSensitiveDataPolicyDefault();
  }

  return accountPolicy
    ? parseSensitiveDataPolicy(accountPolicy)
    : getSensitiveDataPolicyDefault();
}

export function getSensitiveDataPolicyDefault(): SensitiveDataPolicy {
  return env.SENSITIVE_DATA_POLICY_DEFAULT
    ? parseSensitiveDataPolicy(env.SENSITIVE_DATA_POLICY_DEFAULT)
    : DEFAULT_SENSITIVE_DATA_POLICY;
}

export function isSensitiveDataPolicyLocked() {
  return env.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED;
}
