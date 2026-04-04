const ZERO_WIDTH_CHARS = /\u200B|\u200C|\u200D|\u2060|\uFEFF/g;

const BIDI_OVERRIDE_CHARS = /[\u202A-\u202E\u2066-\u2069]/g;

const HTML_COMMENT = /<!--[\s\S]*?-->/g;

// Matches style attribute values, tolerating whitespace around colons and values.
// Each pattern targets a known hidden-content technique.
const HIDDEN_STYLE_PATTERNS = [
  /display\s*:\s*none/i,
  /visibility\s*:\s*hidden/i,
  /font-size\s*:\s*0(?:px|em|rem|%|pt)?\s*[;"']/i,
  /opacity\s*:\s*0\s*[;"']/i,
  /color\s*:\s*(?:#fff(?:fff)?|white|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))\s*[;"']/i,
];

// Patterns that only hide content when combined (both must appear in the same style).
const COMBINED_HIDDEN_PATTERNS: Array<[RegExp, RegExp]> = [
  [/max-height\s*:\s*0/i, /overflow\s*:\s*hidden/i],
  [/width\s*:\s*0/i, /overflow\s*:\s*hidden/i],
  [/height\s*:\s*0/i, /overflow\s*:\s*hidden/i],
  [/position\s*:\s*absolute/i, /left\s*:\s*-\d{4,}px/i],
];

/** Strip hidden/invisible content from text before AI processing */
export function stripHiddenText(text: string): string {
  return text.replace(ZERO_WIDTH_CHARS, "").replace(BIDI_OVERRIDE_CHARS, "");
}

/** Strip hidden/invisible content from HTML before AI processing */
export function stripHiddenHtml(html: string): string {
  let result = html.replace(HTML_COMMENT, "");
  result = removeHiddenElements(result);
  result = result
    .replace(ZERO_WIDTH_CHARS, "")
    .replace(BIDI_OVERRIDE_CHARS, "");
  return result;
}

/** Strip both text and HTML content */
export function sanitizeForAI(input: {
  textPlain?: string;
  textHtml?: string;
}): { textPlain?: string; textHtml?: string } {
  return {
    textPlain: input.textPlain ? stripHiddenText(input.textPlain) : undefined,
    textHtml: input.textHtml ? stripHiddenHtml(input.textHtml) : undefined,
  };
}

// Regex to match an HTML element with a style attribute.
// Captures: tag name, the style value, and the full element including content and closing tag.
// Uses a non-greedy match for the element body to handle nested tags conservatively.
const STYLED_ELEMENT_RE =
  /<(\w+)\b[^>]*?\bstyle\s*=\s*["']([^"']*)["'][^>]*>[\s\S]*?<\/\1>/gi;

function removeHiddenElements(html: string): string {
  // Iteratively remove hidden elements since removing an outer element
  // may not be needed if inner ones are hidden. One pass is sufficient
  // for non-nested cases; a second pass catches newly-exposed patterns.
  let previous = "";
  let current = html;
  // Cap iterations to avoid pathological inputs
  for (let i = 0; i < 3 && current !== previous; i++) {
    previous = current;
    current = current.replace(STYLED_ELEMENT_RE, (match, _tag, style) => {
      if (isHiddenStyle(style)) return "";
      return match;
    });
  }
  return current;
}

function isHiddenStyle(style: string): boolean {
  // Append a semicolon so patterns that anchor on a delimiter always match
  const s = `${style};`;

  for (const pattern of HIDDEN_STYLE_PATTERNS) {
    if (pattern.test(s)) return true;
  }

  for (const [a, b] of COMBINED_HIDDEN_PATTERNS) {
    if (a.test(s) && b.test(s)) return true;
  }

  return false;
}
