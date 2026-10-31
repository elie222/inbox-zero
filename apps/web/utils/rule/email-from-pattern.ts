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

// Escape regex metacharacters, then turn the `*` glob into `.*`. A run of `*`
// becomes a single `.*`: adjacent `.*` terms backtrack badly on a long address
// that doesn't match.
export function globToRegexSource(pattern: string) {
  return pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*+/g, ".*");
}

// Anchored: for from/to address patterns, so a pattern matches a whole address
// boundary and cannot be satisfied by a spoofed prefix/suffix (e.g. a rule for
// `boss@company.com` must not match `boss@company.com.evil.com`).
export function createAnchoredAddressRegex(pattern: string) {
  // `@domain` → any local part, exact domain (no subdomain), e.g. user@domain.
  if (pattern.startsWith("@")) {
    return new RegExp(`^.*${globToRegexSource(pattern)}$`);
  }
  // `local@domain` → exact address (local part may contain `*` wildcards).
  if (pattern.includes("@")) {
    return new RegExp(`^${globToRegexSource(pattern)}$`);
  }
  // Bare domain → addresses at that domain or a subdomain (`@domain`/`.domain`),
  // but not a lookalike domain (e.g. `example.com` must not match myexample.com).
  return new RegExp(`^.*[@.]${globToRegexSource(pattern)}$`);
}
