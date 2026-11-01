export type MentionCandidate = { memberId: string; name: string };

// Mentions come from the text so a typed "@Full Name" counts even when the
// suggestion list was never used. Picked suggestions only break ties between
// teammates who share a display name.
export function getMentionedMemberIds(
  body: string,
  candidates: MentionCandidate[],
  pickedMemberIds: string[] = [],
) {
  const pattern = getMentionPattern(
    candidates.map((candidate) => candidate.name),
    "g",
  );
  if (!pattern) return [];
  const mentionedNames = new Set(
    Array.from(body.matchAll(pattern), (match) =>
      match[1].slice(1).toLowerCase(),
    ),
  );
  return candidates
    .filter((candidate) => {
      const name = candidate.name.toLowerCase();
      if (!mentionedNames.has(name)) return false;
      return (
        pickedMemberIds.includes(candidate.memberId) ||
        !candidates.some(
          (other) => other !== candidate && other.name.toLowerCase() === name,
        )
      );
    })
    .map((candidate) => candidate.memberId);
}

// Group 1 captures the whole "@Name". Longer names come first so "@Jane Doe"
// is not cut short by "@Jane".
export function getMentionPattern(names: string[], flags = "") {
  const alternatives = names
    .filter(Boolean)
    .toSorted((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!alternatives.length) return;
  return new RegExp(
    `(?<![\\p{L}\\p{M}\\p{N}_])(@(?:${alternatives.join("|")}))(?![\\p{L}\\p{M}\\p{N}_])`,
    `iu${flags}`,
  );
}
