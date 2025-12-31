import type { Command } from "./types";

/**
 * Fuzzy search for commands with weighted scoring.
 *
 * Scoring weights (higher = better match):
 * - 100: Exact label match
 * - 90:  Label starts with query
 * - 70:  Label contains query
 * - 50:  Description contains query
 * - 40:  Keywords contain query
 * - 30:  Fuzzy match (characters appear in order)
 */
export function fuzzySearch(query: string, commands: Command[]): Command[] {
  if (!query.trim()) return commands;

  const lowerQuery = query.toLowerCase();

  const scored = commands.map((cmd) => {
    const label = cmd.label.toLowerCase();
    const description = (cmd.description || "").toLowerCase();
    const keywords = (cmd.keywords || []).join(" ").toLowerCase();

    let score = 0;

    if (label === lowerQuery) score = 100;
    else if (label.startsWith(lowerQuery)) score = 90;
    else if (label.includes(lowerQuery)) score = 70;
    else if (description.includes(lowerQuery)) score = 50;
    else if (keywords.includes(lowerQuery)) score = 40;
    else {
      // fuzzy match: all query characters appear in order within label
      let queryIdx = 0;
      for (const char of label) {
        if (char === lowerQuery[queryIdx]) {
          queryIdx++;
          if (queryIdx === lowerQuery.length) {
            score = 30;
            break;
          }
        }
      }
    }

    return { command: cmd, score };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.command.priority ?? 50) - (b.command.priority ?? 50),
    )
    .map(({ command }) => command);
}
