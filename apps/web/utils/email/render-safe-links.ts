import { escapeHtml } from "@/utils/string";

export function renderEmailTextWithSafeLinks(text: string): string {
  const matches = findLinkMatches(text);
  if (!matches.length) return escapeTextSegment(text);

  let result = "";
  let lastIndex = 0;

  for (const match of matches) {
    if (match.start < lastIndex) continue;

    result += escapeTextSegment(text.slice(lastIndex, match.start));

    const safeUrl = getSafeEmailLinkUrl(match.url);
    if (!safeUrl) {
      result += escapeTextSegment(match.raw);
      lastIndex = match.end;
      continue;
    }

    const label = escapeHtml(formatLinkLabel(match.label, safeUrl));
    result += `<a href="${escapeHtml(safeUrl)}">${label}</a>`;
    lastIndex = match.end;
  }

  result += escapeTextSegment(text.slice(lastIndex));
  return result;
}

function findLinkMatches(text: string) {
  const matches = [
    ...findHtmlAnchorMatches(text),
    ...findMarkdownLinkMatches(text),
  ].sort((left, right) => left.start - right.start);

  return matches.filter((match, index) => {
    const previousMatch = matches[index - 1];
    return !previousMatch || match.start >= previousMatch.end;
  });
}

function findHtmlAnchorMatches(text: string) {
  const matches: Array<{
    end: number;
    label: string;
    raw: string;
    start: number;
    url: string;
  }> = [];
  const regex = /<a\s+[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;

  let match = regex.exec(text);
  while (match) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      url: match[2] || "",
      label: stripHtmlTags(match[3] || ""),
    });

    match = regex.exec(text);
  }

  return matches;
}

function findMarkdownLinkMatches(text: string) {
  const matches: Array<{
    end: number;
    label: string;
    raw: string;
    start: number;
    url: string;
  }> = [];
  const regex = /\[([^[\]]+)\]\(([^()\s]+)\)/g;

  let match = regex.exec(text);
  while (match) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
      url: match[2] || "",
      label: match[1] || "",
    });

    match = regex.exec(text);
  }

  return matches;
}

function formatLinkLabel(label: string, url: string) {
  const normalizedLabel = normalizeWhitespace(stripHtmlTags(label));
  const destinationLabel = getLinkDestinationLabel(url);

  if (!normalizedLabel) return destinationLabel;
  if (
    normalizedLabel.toLowerCase().includes(destinationLabel.toLowerCase()) ||
    normalizedLabel.toLowerCase().includes(url.toLowerCase())
  ) {
    return normalizedLabel;
  }

  return `${normalizedLabel} (${destinationLabel})`;
}

function getLinkDestinationLabel(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol === "mailto:") {
    return parsed.pathname || url;
  }

  return parsed.hostname.replace(/^www\./, "");
}

function getSafeEmailLinkUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "http:" &&
      parsed.protocol !== "https:" &&
      parsed.protocol !== "mailto:"
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, " ");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeTextSegment(value: string) {
  return escapeHtml(value).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");
}
