import { ActionType } from "@/generated/prisma/enums";
import {
  isAddressLikeEmailPattern,
  splitEmailPatterns,
} from "@/utils/rule/email-from-pattern";

const LOW_TRUST_FROM_BLOCKED_ACTION_TYPES = new Set<ActionType>([
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
]);

export const LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE =
  "Reply, send, and forward actions require an email- or domain-based From condition. Name-based and wildcard From matches can be spoofed.";

export function hasLowTrustStaticFromPattern(from: string | null | undefined) {
  if (!from?.trim()) return false;

  return splitEmailPatterns(from).some(
    (pattern) => !isAddressLikeEmailPattern(pattern),
  );
}

export function getBlockedLowTrustStaticFromActionTypes(
  from: string | null | undefined,
  actionTypes: readonly ActionType[],
) {
  if (!hasLowTrustStaticFromPattern(from)) return [];

  return actionTypes.filter((type) =>
    LOW_TRUST_FROM_BLOCKED_ACTION_TYPES.has(type),
  );
}
