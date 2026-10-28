// Text written to and matched against message_fts. The index and the query
// must be prepared the same way, so both sides go through this module.

export function searchableBody(content: {
  text: string | null;
  html: string | null;
}): string {
  // Some senders ship an empty text part next to the real HTML body.
  if (content.text?.trim()) return searchableText(content.text);
  if (content.html) return searchableText(htmlToSearchText(content.html));
  return "";
}

// unicode61 splits words on spaces and punctuation, so a run of Chinese,
// Japanese, or Thai would otherwise index as one token that no word inside it
// can match. Indexing each character as a token and querying terms as
// character phrases keeps substring search working for those scripts.
export function searchableText(value: string): string {
  return value.replace(UNSPACED_SCRIPT, " $& ");
}

// Builds an FTS5 query where each term, or the whole phrase, is one quoted
// string: quoting makes FTS5 read operators, column filters, and punctuation
// as plain text, and the trailing * matches words as they are being typed.
// Resolves null when nothing in the input can match an indexed token.
export function searchMatchQuery(
  value: string,
  match: "term" | "phrase",
): string | null {
  const parts = match === "phrase" ? [value] : value.split(/\s+/);
  const quoted = parts
    .map((part) => searchableText(part).replace(/\s+/g, " ").trim())
    .filter((part) => TOKEN_CHARACTER.test(part))
    // A one-character prefix expands to a large share of the vocabulary and
    // made the first keystroke the slowest search, so it matches whole words.
    .map((part) => {
      const prefix = [...part].length > 1 ? "*" : "";
      return `"${part.replaceAll('"', '""')}"${prefix}`;
    });
  return quoted.length ? quoted.join(" ") : null;
}

// Runs during sync for every HTML-only body, in a worker or Node process with
// no DOM, so it is a small regex pass rather than a parser: only the words
// matter here, not layout.
export function htmlToSearchText(html: string): string {
  return html
    .replace(HIDDEN_CONTENT, " ")
    .replace(TAG, (_tag, name: string | undefined) =>
      name && INLINE_TAGS.has(name.toLowerCase()) ? "" : " ",
    )
    .replace(ENTITY, decodeEntity)
    .replace(/[\s\u200B-\u200D\u2060\uFEFF]+/g, " ")
    .trim();
}

// unicode61's default token characters: letters, numbers, and private use.
const TOKEN_CHARACTER = /[\p{L}\p{N}\p{Co}]/u;

const UNSPACED_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/gu;

// Everything a <head> holds besides tags is a title, style, or script. Like
// browsers, an unclosed comment or raw-text element runs to the end of the
// document, which also keeps the scan linear on malformed mail.
const HIDDEN_CONTENT =
  /<!--[\s\S]*?(?:-->|$)|<(style|script|template|title)\b[^>]*>[\s\S]*?(?:<\/\1\s*>|$)/gi;

const TAG = /<(?:\/?([a-zA-Z][\w:-]*)|[!?])(?:"[^"<]*"|'[^'<]*'|[^'"<>])*>/g;

// Tags that sit inside words; every other tag separates words.
const INLINE_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "big",
  "code",
  "em",
  "font",
  "i",
  "mark",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "u",
  "wbr",
]);

const ENTITY =
  /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,31}));?/g;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  zwnj: "",
  zwj: "",
  shy: "",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
  yen: "¥",
  cent: "¢",
  deg: "°",
  times: "×",
  divide: "÷",
  sect: "§",
  para: "¶",
  iexcl: "¡",
  iquest: "¿",
  szlig: "ß",
  aelig: "æ",
  AElig: "Æ",
  oslash: "ø",
  Oslash: "Ø",
  oelig: "œ",
  OElig: "Œ",
  eth: "ð",
  ETH: "Ð",
  thorn: "þ",
  THORN: "Þ",
};

// Accented Latin letters (&eacute;, &Uuml;, &scaron;, ...) are a letter plus
// a named mark, so they are composed instead of listed one by one.
const COMBINING_MARKS: Record<string, string> = {
  grave: "\u0300",
  acute: "\u0301",
  circ: "\u0302",
  tilde: "\u0303",
  uml: "\u0308",
  ring: "\u030A",
  caron: "\u030C",
  cedil: "\u0327",
};

const ACCENTED_LETTER =
  /^([a-zA-Z])(grave|acute|circ|tilde|uml|ring|caron|cedil)$/;

function decodeEntity(
  entity: string,
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string {
  if (decimal || hex) {
    const codePoint = decimal
      ? Number(decimal)
      : Number.parseInt(hex ?? "", 16);
    const valid =
      codePoint > 0 &&
      codePoint <= 0x10_ff_ff &&
      (codePoint < 0xd8_00 || codePoint > 0xdf_ff);
    return valid ? String.fromCodePoint(codePoint) : " ";
  }
  if (!name) return entity;
  const named = NAMED_ENTITIES[name];
  if (named !== undefined) return named;
  const accented = ACCENTED_LETTER.exec(name);
  if (!accented) return entity;
  return `${accented[1]}${COMBINING_MARKS[accented[2]]}`.normalize("NFC");
}
