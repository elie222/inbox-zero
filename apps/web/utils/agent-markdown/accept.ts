const PRODUCES = ["text/html", "text/markdown"] as const;

export type ProducedMediaType = (typeof PRODUCES)[number];

type AcceptEntry = {
  position: number;
  q: number;
  type: string;
};

/**
 * Parse an Accept header into media-range entries with q-values.
 * Spec-oriented subset sufficient for HTML vs Markdown negotiation.
 */
export function parseAcceptHeader(header: string | null): AcceptEntry[] {
  if (!header?.trim()) return [];

  return header.split(",").flatMap((part, position) => {
    const segments = part
      .trim()
      .split(";")
      .map((segment) => segment.trim());
    const type = segments[0]?.toLowerCase();
    if (!type) return [];

    let q = 1;
    for (const param of segments.slice(1)) {
      const [rawName, rawValue] = param.split("=").map((s) => s.trim());
      if (rawName === "q" && rawValue != null) {
        const parsed = Number(rawValue);
        if (!Number.isNaN(parsed)) {
          q = Math.min(1, Math.max(0, parsed));
        }
      }
    }

    return [{ type, q, position }];
  });
}

function specificity(type: string): number {
  if (type === "*/*") return 0;
  if (type.endsWith("/*")) return 1;
  return 2;
}

function matches(entryType: string, candidate: string): boolean {
  if (entryType === "*/*") return true;
  if (entryType.endsWith("/*")) {
    return candidate.startsWith(entryType.slice(0, -1));
  }
  return entryType === candidate;
}

/**
 * Pick the preferred representation among text/html and text/markdown.
 * Returns null when the client explicitly rejects every produced type.
 */
export function preferredType(
  acceptHeader: string | null,
): ProducedMediaType | null {
  const entries = parseAcceptHeader(acceptHeader);
  if (entries.length === 0) return "text/html";

  let bestType: ProducedMediaType | null = null;
  let bestQ = -1;
  let bestPosition = Number.POSITIVE_INFINITY;

  for (const candidate of PRODUCES) {
    let matched: AcceptEntry | null = null;

    for (const entry of entries) {
      if (!matches(entry.type, candidate)) continue;
      if (
        !matched ||
        specificity(entry.type) > specificity(matched.type) ||
        (specificity(entry.type) === specificity(matched.type) &&
          entry.position < matched.position)
      ) {
        matched = entry;
      }
    }

    if (!matched || matched.q <= 0) continue;

    if (
      matched.q > bestQ ||
      (matched.q === bestQ && matched.position < bestPosition)
    ) {
      bestQ = matched.q;
      bestPosition = matched.position;
      bestType = candidate;
    }
  }

  return bestType;
}

export function prefersMarkdown(acceptHeader: string | null): boolean {
  return preferredType(acceptHeader) === "text/markdown";
}

/** Append Accept to Vary without dropping existing tokens (e.g. RSC vary). */
export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get("vary");
  if (!existing) {
    headers.set("Vary", "Accept");
    return;
  }

  const tokens = existing.split(",").map((token) => token.trim().toLowerCase());
  if (!tokens.includes("accept")) {
    headers.set("Vary", `${existing}, Accept`);
  }
}
