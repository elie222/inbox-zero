import type { Logger } from "@/utils/logger";
import {
  isAddressLikeEmailPattern,
  splitEmailPatterns,
} from "@/utils/rule/email-from-pattern";

const MODULE = "match-patterns";

// Stacked reply/forward markers mailers prepend: "Re:", "RE: RE:", "Fwd:",
// "Fw:", "Re[2]:" — a subject rule describes the conversation topic, so
// replies must keep matching it (a "starts with Daily Report" rule has to
// catch "Re: Daily Report")
const REPLY_PREFIX_REGEX = /^(?:\s*(?:re|fwd?)(?:\[\d+\])?:\s*)+/i;

export function matchesTextPattern(
  pattern: string,
  text: string,
  logger: Logger,
  options?: { anchorStart?: boolean },
) {
  try {
    return matchesRulePattern(pattern, text, options?.anchorStart);
  } catch (error) {
    logger.error("Invalid rule pattern", { module: MODULE, pattern, error });
    return false;
  }
}

export function matchesSubjectPattern(
  pattern: string,
  subject: string,
  logger: Logger,
  options?: { anchorStart?: boolean },
) {
  // "Daily Report || Weekly Summary" filters both subjects with one rule.
  // Double pipe: single "|" stays a literal character because real subjects
  // contain it ("Status: Active | Pending"), and commas/OR are ordinary
  // subject text too — unlike in sender lists.
  return splitSubjectPatterns(pattern).some((patternPart) =>
    matchesSingleSubjectPattern(patternPart, subject, logger, options),
  );
}

export function splitSubjectPatterns(pattern: string): string[] {
  const parts = pattern
    .split("||")
    .map((part) => part.trim())
    .filter(Boolean);
  // "||" alone must not vanish into match-nothing; fall back to the raw
  // pattern so the condition still evaluates literally
  return parts.length ? parts : [pattern];
}

function matchesSingleSubjectPattern(
  pattern: string,
  subject: string,
  logger: Logger,
  options?: { anchorStart?: boolean },
) {
  if (matchesTextPattern(pattern, subject, logger, options)) return true;

  // Users write conditions from what they see ("RE: Daily") and mailers
  // stack prefixes freely — strip them from BOTH sides so the condition
  // describes the topic, and original vs reply match alike
  const strippedSubject = subject.replace(REPLY_PREFIX_REGEX, "");
  const strippedPattern = pattern.replace(REPLY_PREFIX_REGEX, "");
  if (strippedSubject === subject && strippedPattern === pattern) return false;
  return matchesTextPattern(strippedPattern, strippedSubject, logger, options);
}

export function matchesEmailFieldPattern({
  pattern,
  addressText,
  displayNameText,
  logger,
}: {
  pattern: string;
  addressText: string;
  displayNameText: string;
  logger: Logger;
}) {
  try {
    const patterns = splitEmailPatterns(pattern);

    for (const patternPart of patterns) {
      const normalizedPattern = patternPart.trim().toLowerCase();

      if (isAddressLikeEmailPattern(patternPart)) {
        // `addressText` may hold several recipients joined as "a@x, b@y";
        // the anchored match must be tested against each address individually.
        const addresses = addressText.split(", ").filter(Boolean);
        if (
          addresses.some((address) =>
            matchesAnchoredAddressPattern(normalizedPattern, address),
          )
        ) {
          return true;
        }
        continue;
      }

      if (
        displayNameText &&
        matchesGlob({ pattern: normalizedPattern, text: displayNameText })
      ) {
        return true;
      }
      if (matchesGlob({ pattern: normalizedPattern, text: addressText })) {
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error("Invalid email match pattern", { module: MODULE });
    logger.trace("Invalid email match pattern details", {
      module: MODULE,
      pattern,
      error,
    });
    return false;
  }
}

function matchesRulePattern(
  pattern: string,
  text: string,
  anchorStart?: boolean,
) {
  // Case-insensitive: a rule for "RE: Daily" must match "Re: Daily Report" —
  // nobody types conditions to match mailer casing
  return matchesGlob({
    pattern: pattern.toLowerCase(),
    text: text.toLowerCase(),
    anchorStart,
  });
}

// Non-backtracking glob matching: `*` spans any characters (newlines
// included, exactly like the `.*` regex this replaced). Splitting the
// pattern into literal segments and locating them left-to-right with
// indexOf is equivalent for existence checks and runs in linear time —
// where a wildcard regex suffers catastrophic backtracking on crafted
// inputs, and the matched text here is raw email content that any remote
// sender controls (a confirmed denial-of-service vector).
function matchesGlob({
  pattern,
  text,
  anchorStart = false,
  anchorEnd = false,
}: {
  pattern: string;
  text: string;
  anchorStart?: boolean;
  anchorEnd?: boolean;
}): boolean {
  const segments = pattern.split("*");

  if (segments.length === 1) {
    if (anchorStart && anchorEnd) return text === pattern;
    if (anchorStart) return text.startsWith(pattern);
    if (anchorEnd) return text.endsWith(pattern);
    return text.includes(pattern);
  }

  const first = segments[0];
  const last = segments[segments.length - 1];

  // Earliest placement of each segment is always optimal: it leaves the
  // most room for the segments that follow.
  let pos = 0;
  if (anchorStart) {
    if (!text.startsWith(first)) return false;
    pos = first.length;
  } else if (first) {
    const index = text.indexOf(first);
    if (index === -1) return false;
    pos = index + first.length;
  }

  let end = text.length;
  const lastIsPinned = anchorEnd && last !== "";
  if (lastIsPinned) {
    if (!text.endsWith(last)) return false;
    end = text.length - last.length;
    if (end < pos) return false;
  }

  const middleEnd = lastIsPinned ? segments.length - 1 : segments.length;
  for (let i = 1; i < middleEnd; i++) {
    const segment = segments[i];
    if (!segment) continue;
    const index = text.indexOf(segment, pos);
    if (index === -1 || index + segment.length > end) return false;
    pos = index + segment.length;
  }

  return true;
}

// Anchored: from/to address patterns match whole-address boundaries, so a
// rule for `boss@company.com` cannot be satisfied by a spoofed prefix or
// suffix like boss@company.com.evil.com. Both sides arrive lowercased.
function matchesAnchoredAddressPattern(
  pattern: string,
  address: string,
): boolean {
  // `@domain` → any local part, exact domain (no subdomain), e.g. user@domain
  if (pattern.startsWith("@")) {
    return matchesGlob({ pattern, text: address, anchorEnd: true });
  }
  // `local@domain` → exact address (local part may contain `*` wildcards)
  if (pattern.includes("@")) {
    return matchesGlob({
      pattern,
      text: address,
      anchorStart: true,
      anchorEnd: true,
    });
  }
  // Bare domain → addresses at that domain or a subdomain: the pattern must
  // cover everything after an `@` or `.` boundary, never a lookalike domain
  // (e.g. `example.com` must not match myexample.com)
  for (let i = address.length - 1; i >= 0; i--) {
    const boundary = address[i];
    if (boundary !== "@" && boundary !== ".") continue;
    if (
      matchesGlob({
        pattern,
        text: address.slice(i + 1),
        anchorStart: true,
        anchorEnd: true,
      })
    ) {
      return true;
    }
  }
  return false;
}
