import type { UIMessageChunk, UIMessageStreamWriter } from "ai";

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

const allowedTagNames = Object.keys(assistantAllowedTags);
const tagNamesPattern = allowedTagNames.join("|");
const tagNameFragmentPattern = /[a-zA-Z0-9-]*/y;
const tagCandidateStartPattern = /[<&\\]/g;
const entityTagOpener = "&lt;";
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
// An assistant tag is a few dozen characters at most. Once a candidate has run
// longer than this without closing, it is prose rather than an unfinished tag;
// releasing it keeps a stray "<email" from making every later delta rescan the
// whole buffered remainder of the message.
const maxPendingTagLength = 512;
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

/**
 * Forwards an assistant UI message stream with its text deltas normalized, so
 * every client receives canonical tags instead of the entity-escaped,
 * smart-quoted, backslashed, or self-closing variants the model sometimes
 * emits. Because the writer is what `createUIMessageStream` persists, this also
 * keeps stored messages canonical.
 */
export async function writeNormalizedAssistantTagStream({
  stream,
  writer,
}: {
  stream: AsyncIterable<UIMessageChunk>;
  writer: UIMessageStreamWriter;
}) {
  const normalizer = createAssistantTagStreamNormalizer();
  const releaseHeldBackText = () => {
    for (const [id, delta] of normalizer.flushAll()) {
      writer.write({ type: "text-delta", id, delta });
    }
  };

  try {
    for await (const chunk of stream) {
      if (chunk.type === "text-delta") {
        const delta = normalizer.push(chunk.id, chunk.delta);
        if (delta) writer.write({ ...chunk, delta });
        continue;
      }

      // Release whatever the part ended mid-tag on before closing it out.
      if (chunk.type === "text-end") {
        const delta = normalizer.flush(chunk.id);
        if (delta) writer.write({ type: "text-delta", id: chunk.id, delta });
      }

      // `Chat` throws out of its stream processor on an error chunk and reads
      // nothing after it, so held-back text has to go out ahead of that chunk.
      if (chunk.type === "error") releaseHeldBackText();

      writer.write(chunk);
    }
  } finally {
    // An aborted or truncated stream never sends `text-end`, so release what
    // is still held back instead of dropping it.
    releaseHeldBackText();
  }
}

/**
 * Text is forwarded as soon as it arrives; only an unfinished assistant tag is
 * held back until it closes.
 */
export function createAssistantTagStreamNormalizer() {
  const buffers = new Map<string, string>();

  return {
    push(partId: string, delta: string) {
      const buffer = (buffers.get(partId) ?? "") + delta;
      const boundary = findSafeEmitBoundary(buffer);
      buffers.set(partId, buffer.slice(boundary));

      return normalizeAssistantTagMarkup(buffer.slice(0, boundary));
    },
    flush(partId: string) {
      const buffer = buffers.get(partId) ?? "";
      buffers.delete(partId);

      return normalizeAssistantTagMarkup(buffer);
    },
    flushAll() {
      const remaining: [partId: string, delta: string][] = [];
      for (const [partId, buffer] of buffers) {
        const delta = normalizeAssistantTagMarkup(buffer);
        if (delta) remaining.push([partId, delta]);
      }
      buffers.clear();

      return remaining;
    },
  };
}

function decodeEntityEscapedTags(content: string) {
  let normalized = "";
  let copyFrom = 0;

  for (const match of content.matchAll(entityTagStartPattern)) {
    const start = match.index;
    if (start < copyFrom) continue;

    const closingStart = findTagClosing(content, start + match[0].length, {
      allowRawTerminator: false,
    });
    if (closingStart === undefined) break;

    normalized += content.slice(copyFrom, start);
    normalized += decodeTagEntities(
      `<${content.slice(start + entityTagOpener.length, closingStart)}>`,
    );
    copyFrom = closingStart + "&gt;".length;
  }

  if (copyFrom === 0) return content;

  return normalized + content.slice(copyFrom);
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
  if (character !== "&") return;

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

function startsWithIgnoreCase(
  content: string,
  cursor: number,
  lowercaseValue: string,
) {
  return (
    content.slice(cursor, cursor + lowercaseValue.length).toLowerCase() ===
    lowercaseValue
  );
}

// Returns how much of the buffer can be normalized and emitted now: everything
// up to the first tag start that has not been closed yet.
function findSafeEmitBoundary(buffer: string) {
  for (const match of buffer.matchAll(tagCandidateStartPattern)) {
    if (buffer.length - match.index > maxPendingTagLength) continue;
    if (isIncompleteTagCandidate(buffer, match.index)) return match.index;
  }

  return buffer.length;
}

function isIncompleteTagCandidate(buffer: string, index: number) {
  let cursor = index;

  if (buffer[cursor] === "\\") cursor += 1;
  if (cursor >= buffer.length) return true;

  if (buffer[cursor] === "<") {
    cursor += 1;
  } else if (buffer[cursor] === "&") {
    const opener = buffer.slice(cursor, cursor + entityTagOpener.length);
    if (opener.length < entityTagOpener.length) {
      return entityTagOpener.startsWith(opener.toLowerCase());
    }
    if (opener.toLowerCase() !== entityTagOpener) return false;
    cursor += entityTagOpener.length;
  } else {
    return false;
  }

  if (buffer[cursor] === "/") cursor += 1;

  tagNameFragmentPattern.lastIndex = cursor;
  const name = tagNameFragmentPattern.exec(buffer)?.[0] ?? "";
  const nameEnd = cursor + name.length;
  const lowercaseName = name.toLowerCase();

  if (nameEnd >= buffer.length) {
    return allowedTagNames.some((tagName) => tagName.startsWith(lowercaseName));
  }

  if (!allowedTagNames.includes(lowercaseName)) return false;

  return (
    findTagClosing(buffer, nameEnd, { allowRawTerminator: true }) === undefined
  );
}

// Finds the tag's closing delimiter, skipping the quoted regions where a
// delimiter character is part of an attribute value rather than the tag.
function findTagClosing(
  content: string,
  start: number,
  { allowRawTerminator }: { allowRawTerminator: boolean },
) {
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

    if (!quote) {
      if (allowRawTerminator && content[cursor] === ">") return cursor;
      if (startsWithIgnoreCase(content, cursor, "&gt;")) return cursor;
    }

    cursor += 1;
  }
}
