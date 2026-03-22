export enum PrefixType {
  HARD_BLOCK = "hard_block",
  SOFT = "soft",
  INFORMATIONAL = "informational",
}

export interface ParsedPrefix {
  cleanTitle: string;
  type: PrefixType;
}

export function parseEventPrefix(title: string): ParsedPrefix {
  const trimmed = title.trim();

  if (trimmed.startsWith("~")) {
    return { type: PrefixType.SOFT, cleanTitle: trimmed.slice(1).trim() };
  }

  const fyiMatch = trimmed.match(/^fyi:\s*/i);
  if (fyiMatch) {
    return {
      type: PrefixType.INFORMATIONAL,
      cleanTitle: trimmed.slice(fyiMatch[0].length).trim(),
    };
  }

  return { type: PrefixType.HARD_BLOCK, cleanTitle: trimmed };
}
