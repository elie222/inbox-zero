/**
 * Split email rule patterns by pipe, comma, or " OR " separator.
 * Used for from/to fields to support multiple addresses (same semantics as matching).
 */
export function splitEmailPatterns(pattern: string): string[] {
  return pattern
    .split(/\s*\bor\b\s*|[|,]/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** True if the pattern is email- or domain-shaped (not display-name-only). */
export function isAddressLikeEmailPattern(pattern: string): boolean {
  const normalized = pattern.trim().toLowerCase();
  return normalized.includes("@") || /^[^\s@]+\.[^\s@]+$/.test(normalized);
}
