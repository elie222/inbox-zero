export type ParsedFromSplit = {
  /** Full address (`user@domain.com`) or domain (`@domain.com`). */
  value: string;
  /** Short tab title derived from the address or domain. */
  name: string;
};

const EMAIL_RE =
  /[a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}/i;
const DOMAIN_RE = /@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,})/i;

/**
 * Extract a sender or domain filter from a short split description.
 * Supports bare addresses/domains and light phrasing like "from @domain in inbox".
 */
export function parseFromSplitInput(input: string): ParsedFromSplit | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const fromPrefixed = trimmed.match(
    /^(?:from)\s*:?\s*(.+?)(?:\s+(?:in\s+)?(?:the\s+)?inbox)?$/i,
  );
  const candidate = (fromPrefixed?.[1] ?? trimmed)
    .trim()
    .replace(/^["']|["']$/g, "");

  const emailMatch = candidate.match(EMAIL_RE);
  if (emailMatch && isMostlyAddress(candidate, emailMatch[0])) {
    const value = emailMatch[0].toLowerCase();
    return { value, name: nameFromFromValue(value) };
  }

  const domainMatch = candidate.match(DOMAIN_RE);
  if (domainMatch && isMostlyAddress(candidate, domainMatch[0])) {
    const value = `@${domainMatch[1].toLowerCase()}`;
    return { value, name: nameFromFromValue(value) };
  }

  // Phrases like "all emails from @domain that are in the inbox"
  const phraseEmail = trimmed.match(
    /\bfrom\s+(?:address\s+)?(?:"|')?([a-z0-9](?:[a-z0-9._%+-]*[a-z0-9])?@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,})(?:"|')?/i,
  );
  if (phraseEmail) {
    const value = phraseEmail[1].toLowerCase();
    return { value, name: nameFromFromValue(value) };
  }

  const phraseDomain = trimmed.match(
    /\bfrom\s+(?:domain\s+)?(?:"|')?@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,})(?:"|')?/i,
  );
  if (phraseDomain) {
    const value = `@${phraseDomain[1].toLowerCase()}`;
    return { value, name: nameFromFromValue(value) };
  }

  return null;
}

export function isFromDomainFilter(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("@") && !trimmed.slice(1).includes("@");
}

export function getFromFilterDomain(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (isFromDomainFilter(trimmed)) return trimmed.slice(1);
  return null;
}

export function nameFromFromValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (isFromDomainFilter(trimmed)) {
    return trimmed.slice(1).slice(0, 60);
  }
  const local = trimmed.split("@")[0]?.trim();
  return (local || trimmed).slice(0, 60);
}

function isMostlyAddress(candidate: string, match: string): boolean {
  const remainder = candidate.replace(match, "").replace(/[\s<>"']/g, "");
  return remainder.length === 0;
}
