import { ActionType } from "@/generated/prisma/enums";

const LOW_TRUST_FROM_BLOCKED_ACTION_TYPES = new Set<ActionType>([
  ActionType.REPLY,
  ActionType.SEND_EMAIL,
  ActionType.FORWARD,
]);

const STATIC_FROM_PATTERN_SEPARATOR_REGEX = /\s*\bor\b\s*|[|,]/i;

export const LOW_TRUST_STATIC_FROM_OUTBOUND_MESSAGE =
  "Reply, send, and forward actions require an email- or domain-based From condition. Name-based and wildcard From matches can be spoofed.";

export function splitStaticFromPatterns(pattern: string): string[] {
  return pattern
    .split(STATIC_FROM_PATTERN_SEPARATOR_REGEX)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isAddressLikeStaticFromPatternPart(pattern: string): boolean {
  const normalized = pattern.trim().toLowerCase();
  return normalized.includes("@") || /^[^\s@]+\.[^\s@]+$/.test(normalized);
}

export function hasLowTrustStaticFromPattern(from: string | null | undefined) {
  if (!from?.trim()) return false;

  return splitStaticFromPatterns(from).some(
    (pattern) => !isAddressLikeStaticFromPatternPart(pattern),
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
