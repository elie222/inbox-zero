export function tokenizeSearchQuery(query: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of query.trim()) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }
    if (!inQuotes && /\s/.test(char)) {
      if (current) tokens.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  if (current) tokens.push(current);
  return tokens;
}

export function parseSearchToken(token: string): {
  excluded: boolean;
  operator: string | null;
  value: string;
} {
  const excluded = token.startsWith("-") && token.length > 1;
  const raw = excluded ? token.slice(1) : token;
  const colon = raw.indexOf(":");
  if (colon <= 0 || raw.startsWith('"')) {
    return { excluded, operator: null, value: unquoteSearchValue(raw) };
  }
  return {
    excluded,
    operator: raw.slice(0, colon).toLowerCase(),
    value: unquoteSearchValue(raw.slice(colon + 1)),
  };
}

export function unquoteSearchValue(value: string): string {
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  return value;
}

/** Boolean operators like hasattachments: are written true by our search forms, but hand-typed queries also use yes. */
export function isTrueSearchValue(value: string): boolean {
  return /^(true|yes)$/i.test(value);
}
