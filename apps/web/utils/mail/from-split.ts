export type ParsedFromSplit = {
  /** Full address (`user@domain.com`) or domain (`@domain.com`). */
  value: string;
  /** Short tab title derived from the address or domain. */
  name: string;
};

const LOCAL_PART = "[a-z0-9](?:[a-z0-9_%+-]|[.](?=[a-z0-9]))*";
const DNS_DOMAIN = String.raw`[a-z0-9](?:[a-z0-9-]|[.](?=[a-z0-9]))*\.[a-z]{2,}`;

// Dot-atom local part and DNS labels; rejects consecutive dots.
const EMAIL_RE = new RegExp(`${LOCAL_PART}@${DNS_DOMAIN}`, "i");
const DOMAIN_RE = new RegExp(`@(${DNS_DOMAIN})`, "i");

/**
 * Extract a sender or domain filter from a short split description.
 * Supports bare addresses/domains and light phrasing like "from @domain in inbox".
 */
export function parseFromSplitInput(input: string): ParsedFromSplit | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Require a separator after "from" so addresses like from@example.com stay intact.
  const fromPrefixed = trimmed.match(
    /^(?:from)(?:\s*:\s*|\s+)(.+?)(?:\s+(?:in\s+)?(?:the\s+)?inbox)?$/i,
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
    new RegExp(
      String.raw`\bfrom\s+(?:address\s+)?(?:"|')?(${EMAIL_RE.source})(?:"|')?(?=\s|$)`,
      "i",
    ),
  );
  if (phraseEmail) {
    const value = phraseEmail[1].toLowerCase();
    return { value, name: nameFromFromValue(value) };
  }

  const phraseDomain = trimmed.match(
    new RegExp(
      String.raw`\bfrom\s+(?:domain\s+)?(?:"|')?@(${DNS_DOMAIN})(?:"|')?(?=\s|$)`,
      "i",
    ),
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

/**
 * Prefer the full address so distinct senders with the same local part don't
 * collide. Names are capped at 60 chars (DB limit); longer values get a short
 * hash suffix so truncated names stay unique.
 */
export function nameFromFromValue(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const base = isFromDomainFilter(trimmed) ? trimmed.slice(1) : trimmed;
  if (base.length <= 60) return base;
  const suffix = shortHash(base);
  return `${base.slice(0, 60 - suffix.length - 1)}-${suffix}`;
}

function isMostlyAddress(candidate: string, match: string): boolean {
  const remainder = candidate.replace(match, "").replace(/[\s<>"']/g, "");
  return remainder.length === 0;
}

function shortHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36).slice(0, 6);
}
