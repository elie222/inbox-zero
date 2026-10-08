// The "email-safe HTML" profile shared by the parse5 sanitizer (core, any
// runtime) and the DOMPurify config (browser). Both must apply these exact
// rules so content that survives loading also survives sending.

export const EMAIL_BODY_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "big",
  "blockquote",
  "br",
  "caption",
  "center",
  "code",
  "col",
  "colgroup",
  "del",
  "div",
  "em",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "li",
  "ol",
  "p",
  "pre",
  "s",
  "small",
  "span",
  "strike",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

// Removed together with their content. Any other unknown element is unwrapped
// so its text survives.
export const EMAIL_BODY_REMOVED_TAGS = new Set([
  "applet",
  "audio",
  "base",
  "button",
  "embed",
  "form",
  "frame",
  "frameset",
  "head",
  "iframe",
  "input",
  "link",
  "math",
  "meta",
  "noembed",
  "noframes",
  "noscript",
  "object",
  "option",
  "script",
  "select",
  "style",
  "svg",
  "template",
  "textarea",
  "title",
  "video",
  "xmp",
]);

export const EMAIL_BODY_ATTRIBUTES = new Set([
  "align",
  "alt",
  "bgcolor",
  "border",
  "cellpadding",
  "cellspacing",
  "color",
  "colspan",
  "data-content-id",
  "data-smartmail",
  "dir",
  "face",
  "height",
  "href",
  "lang",
  "rel",
  "role",
  "rowspan",
  "size",
  "span",
  "src",
  "start",
  "style",
  "target",
  "title",
  "type",
  "valign",
  "width",
]);

export const SAFE_STYLE_PROPERTIES = new Set([
  "background",
  "background-color",
  "border-collapse",
  "border-spacing",
  "color",
  "direction",
  "display",
  "font",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "height",
  "letter-spacing",
  "line-height",
  "max-height",
  "max-width",
  "min-height",
  "min-width",
  "overflow-wrap",
  "text-align",
  "text-decoration",
  "text-indent",
  "text-transform",
  "vertical-align",
  "white-space",
  "width",
  "word-break",
]);

export const SIGNATURE_CONTAINER_ATTRIBUTE = "data-smartmail";
export const SIGNATURE_CONTAINER_VALUE = "gmail_signature";

/**
 * Returns the value to keep for an attribute in the email body profile, or
 * null when the attribute must be removed. `tagName` is lowercase.
 */
export function sanitizeEmailBodyAttribute(
  tagName: string,
  name: string,
  value: string,
): string | null {
  const trimmed = value.trim();
  switch (name) {
    case "href":
      return tagName === "a" && isSafeEmailUrl(trimmed) ? trimmed : null;
    case "src":
      return tagName === "img" && isSafeEmailBodyImageSource(trimmed)
        ? trimmed
        : null;
    case "target":
      return tagName === "a" ? "_blank" : null;
    case "rel":
      return tagName === "a" ? "noopener noreferrer" : null;
    case "style": {
      const style = sanitizeEmailStyle(value);
      return style || null;
    }
    case "width":
    case "height":
      return /^\d+(?:\.\d+)?(?:px|%)?$/u.test(trimmed) ? trimmed : null;
    case "border":
    case "cellpadding":
    case "cellspacing":
    case "colspan":
    case "rowspan":
    case "span":
      return /^\d{1,4}$/u.test(trimmed) ? trimmed : null;
    case "start":
      return tagName === "ol" && /^-?\d{1,6}$/u.test(trimmed) ? trimmed : null;
    case "type":
      return (tagName === "ol" || tagName === "ul" || tagName === "li") &&
        /^(?:1|a|i|disc|circle|square)$/iu.test(trimmed)
        ? trimmed
        : null;
    case "align":
      return /^(?:left|right|center|justify)$/iu.test(trimmed)
        ? trimmed.toLowerCase()
        : null;
    case "valign":
      return /^(?:top|middle|bottom|baseline)$/iu.test(trimmed)
        ? trimmed.toLowerCase()
        : null;
    case "bgcolor":
    case "color":
      return isSafeTextStyle("color", trimmed.toLowerCase()) ? trimmed : null;
    case "face":
      return tagName === "font" &&
        isSafeTextStyle("font-family", trimmed.toLowerCase())
        ? trimmed
        : null;
    case "size":
      return tagName === "font" && /^[+-]?[1-7]$/u.test(trimmed)
        ? trimmed
        : null;
    case "dir":
      return /^(?:ltr|rtl|auto)$/iu.test(trimmed)
        ? trimmed.toLowerCase()
        : null;
    case "lang":
      return /^[a-z]{2,3}(?:-[a-z\d]{2,8})*$/iu.test(trimmed) ? trimmed : null;
    case "role":
      return /^(?:presentation|none)$/iu.test(trimmed)
        ? trimmed.toLowerCase()
        : null;
    case "alt":
    case "title":
      return value;
    case "data-content-id":
      return tagName === "img" && isSafeContentId(trimmed) ? trimmed : null;
    case "data-smartmail":
      return tagName === "div" && trimmed === SIGNATURE_CONTAINER_VALUE
        ? trimmed
        : null;
    default:
      return null;
  }
}

export function isSafeEmailBodyImageSource(value: string) {
  const source = value.trim();
  if (/^https?:\/\//iu.test(source) || /^blob:/iu.test(source)) return true;
  // Data URIs are dropped: most mail clients block them, and inline images are
  // sent as Content-ID attachments instead.
  return /^cid:/iu.test(source) && isSafeContentId(source.slice(4));
}

export function isRemoteImageSource(value: string) {
  return /^https?:\/\//iu.test(value.trim());
}

export function sanitizeEmailStyle(style: string) {
  return style
    .split(";")
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const separator = declaration.indexOf(":");
      if (separator < 0) return "";
      const property = declaration.slice(0, separator).trim().toLowerCase();
      const value = declaration.slice(separator + 1).trim();
      const normalizedValue = value.toLowerCase();
      const isBoxProperty = /^(?:border|margin|padding)(?:-|$)/u.test(property);
      if (
        (!SAFE_STYLE_PROPERTIES.has(property) && !isBoxProperty) ||
        !value ||
        // Escapes and comments can hide url(), expression() and friends.
        /[\\<>]|\/\*/u.test(value) ||
        /url\(|image-set\(|expression\(|javascript:|-moz-binding|behavior|@import/u.test(
          normalizedValue,
        )
      ) {
        return "";
      }
      return `${property}:${value}`;
    })
    .filter(Boolean)
    .join(";");
}

export function isSafeTextStyle(property: string, value: string) {
  if (property === "color") {
    return /^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)$/u.test(value);
  }
  if (property === "font-family") {
    return value.length <= 200 && /^[\w\s,'"-]+$/u.test(value);
  }
  if (property === "font-size") {
    return /^(?:\d+(?:\.\d+)?(?:px|pt|em|rem|%)|(?:x{1,2}-)?(?:small|large)|medium|smaller|larger)$/u.test(
      value,
    );
  }
  return false;
}

export function canOpenEmailLink(value: string) {
  return /^(?:https?:|mailto:|tel:)/iu.test(value.trim());
}

export function isSafeEmailUrl(value: string) {
  const normalized = value.trim();
  return canOpenEmailLink(normalized) || normalized.startsWith("#");
}

export function isSafeContentId(value: string) {
  return value.length <= 255 && /^[^<>\s]+$/u.test(value);
}
