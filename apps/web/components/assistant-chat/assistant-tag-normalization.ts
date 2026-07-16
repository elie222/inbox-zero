export const assistantAllowedTags = {
  emails: [],
  email: ["id", "threadid", "index"],
  "email-detail": ["id", "threadid"],
  "rule-suggestions": [],
  "rule-suggestion": [
    "name",
    "when",
    "do",
    "label",
    "archive",
    "notify",
    "draft",
    "markread",
  ],
};

const tagNamesPattern = Object.keys(assistantAllowedTags).join("|");
const quotedValuePattern = `(?:"[^"]*"|'[^']*'|[“”][^“”]*[“”]|[‘’][^‘’]*[‘’])`;
const entityTagStartPattern = new RegExp(
  `&lt;/?(?:${tagNamesPattern})(?=[\\s/]|&gt;)`,
  "gi",
);
const backslashEscapedTagPattern = new RegExp(
  `\\\\(</?(?:${tagNamesPattern})(?=[\\s/>]))`,
  "gi",
);
const assistantTagPattern = new RegExp(
  `</?(?:${tagNamesPattern})(?=[\\s/>])(?:${quotedValuePattern}|[^>"'“”‘’])*>`,
  "gi",
);
const selfClosingTagPattern = new RegExp(
  `<(${tagNamesPattern})(?=[\\s/>])((?:${quotedValuePattern}|[^>"'“”‘’])*?)\\s*/>`,
  "gi",
);
const smartDoubleQuotedAttributePattern = /=\s*[“”]([^“”]*)[“”]/g;
const smartSingleQuotedAttributePattern = /=\s*[‘’]([^‘’]*)[‘’]/g;
const tagWhitespacePattern = /("[^"]*"|'[^']*')|\s+/g;
const encodedDoubleQuotes = ["&quot;", "&#34;", "&#x22;"];
const encodedSingleQuotes = ["&apos;", "&#39;", "&#x27;"];
type QuoteKind =
  | "ascii-double"
  | "ascii-single"
  | "smart-double"
  | "smart-single"
  | "encoded-double"
  | "encoded-single";

export function normalizeAssistantTagMarkup(content: string) {
  return decodeEntityEscapedTags(content)
    .replace(backslashEscapedTagPattern, "$1")
    .replace(assistantTagPattern, normalizeTag)
    .replace(selfClosingTagPattern, "<$1$2></$1>");
}

function decodeEntityEscapedTags(content: string) {
  let normalized = "";
  let copyFrom = 0;

  for (const match of content.matchAll(entityTagStartPattern)) {
    const start = match.index;
    if (start < copyFrom) continue;

    const closingStart = findEntityTagClosing(content, start + match[0].length);
    if (closingStart === undefined) break;

    normalized += content.slice(copyFrom, start);
    normalized += decodeTagEntities(
      `<${content.slice(start + "&lt;".length, closingStart)}>`,
    );
    copyFrom = closingStart + "&gt;".length;
  }

  if (copyFrom === 0) return content;

  return normalized + content.slice(copyFrom);
}

function findEntityTagClosing(content: string, start: number) {
  let quote: QuoteKind | undefined;
  let cursor = start;

  while (cursor < content.length) {
    const quoteToken = getQuoteToken(content, cursor);
    if (quoteToken) {
      quote =
        quote === quoteToken.kind ? undefined : (quote ?? quoteToken.kind);
      cursor += quoteToken.length;
      continue;
    }

    if (!quote && startsWithIgnoreCase(content, cursor, "&gt;")) {
      return cursor;
    }

    cursor += 1;
  }
}

function getQuoteToken(content: string, cursor: number) {
  const character = content[cursor];
  if (character === '"') {
    return { kind: "ascii-double" as const, length: 1 };
  }
  if (character === "'") {
    return { kind: "ascii-single" as const, length: 1 };
  }
  if (character === "“" || character === "”") {
    return { kind: "smart-double" as const, length: 1 };
  }
  if (character === "‘" || character === "’") {
    return { kind: "smart-single" as const, length: 1 };
  }

  const doubleQuote = encodedDoubleQuotes.find((value) =>
    startsWithIgnoreCase(content, cursor, value),
  );
  if (doubleQuote) {
    return { kind: "encoded-double" as const, length: doubleQuote.length };
  }

  const singleQuote = encodedSingleQuotes.find((value) =>
    startsWithIgnoreCase(content, cursor, value),
  );
  if (singleQuote) {
    return { kind: "encoded-single" as const, length: singleQuote.length };
  }
}

function normalizeTag(tag: string) {
  return tag
    .replace(smartDoubleQuotedAttributePattern, '="$1"')
    .replace(smartSingleQuotedAttributePattern, "='$1'")
    .replace(
      tagWhitespacePattern,
      (_match, quotedAttribute: string | undefined) => quotedAttribute ?? " ",
    );
}

function decodeTagEntities(tag: string) {
  return tag
    .replace(/&(?:quot|#34|#x22);/gi, '"')
    .replace(/&(?:apos|#39|#x27);/gi, "'")
    .replace(/&amp;/gi, "&");
}

function startsWithIgnoreCase(content: string, cursor: number, value: string) {
  return (
    content.slice(cursor, cursor + value.length).toLowerCase() ===
    value.toLowerCase()
  );
}
