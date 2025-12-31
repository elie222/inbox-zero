import type { Command } from "./types";

export function fuzzySearch(query: string, commands: Command[]): Command[] {
  if (!query.trim()) return commands;

  const lowerQuery = query.toLowerCase();

  const scored = commands.map((cmd) => {
    const label = cmd.label.toLowerCase();
    const description = (cmd.description || "").toLowerCase();
    const keywords = (cmd.keywords || []).join(" ").toLowerCase();

    let score = 0;

    // exact match in label
    if (label === lowerQuery) score = 100;
    // starts with query
    else if (label.startsWith(lowerQuery)) score = 90;
    // contains query in label
    else if (label.includes(lowerQuery)) score = 70;
    // contains in description
    else if (description.includes(lowerQuery)) score = 50;
    // contains in keywords
    else if (keywords.includes(lowerQuery)) score = 40;
    // fuzzy match - all characters present in order
    else {
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
