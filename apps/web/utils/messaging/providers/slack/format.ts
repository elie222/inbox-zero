/**
 * Convert standard Markdown to Slack mrkdwn format.
 *
 * Key differences:
 * - Bold: **text** → *text*
 * - Links: [text](url) → <url|text>
 * - Headings: # text → *text* (Slack has no heading syntax)
 * - Bullets: * item / - item → • item
 */
export function markdownToSlackMrkdwn(text: string): string {
  return (
    text
      // Links: [text](url) → <url|text>  (must come before bold conversion)
      .replace(/\[([^[\]]+)\]\(([^()]+)\)/g, "<$2|$1>")
      // Handle escaped Markdown from model outputs: \*\*text\*\* → *text*
      .replace(/\\\*\\\*(.+?)\\\*\\\*/g, "*$1*")
      // Bold: **text** → *text*
      .replace(/\*\*(.+?)\*\*/g, "*$1*")
      // Headings: # text → *text*
      .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
      // Escaped unordered list bullets: \* item / \- item → • item
      .replace(/^(\s*)\\[*-]\s+/gm, "$1• ")
      // Unordered list bullets: * item or - item → • item
      .replace(/^(\s*)[*-]\s+/gm, "$1• ")
  );
}

/**
 * Normalizes lightweight HTML that can leak into draft previews before
 * converting the result to Slack mrkdwn.
 */
export function richTextToSlackMrkdwn(text: string): string {
  const links: Array<{ token: string; replacement: string }> = [];

  const normalized = normalizeSlackRichText(
    text.replace(
      /<a\b[^>]*href=(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_match, _quote, href: string, label: string) => {
        const safeHref = sanitizeSlackLinkHref(href);
        const safeLabel =
          normalizeSlackRichText(label).trim() || normalizeSlackRichText(href);

        if (!safeHref) return safeLabel;

        const token = createSlackLinkToken({ sourceText: text, links });
        links.push({
          token,
          replacement: `<${safeHref}|${safeLabel || safeHref}>`,
        });
        return token;
      },
    ),
  ).trim();

  const mrkdwn = markdownToSlackMrkdwn(normalized);

  return links.reduce(
    (result, link) => result.replaceAll(link.token, link.replacement),
    mrkdwn,
  );
}

function normalizeSlackRichText(text: string): string {
  const parts: string[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char !== "<") {
      if (char === "&") {
        const entity = readHtmlEntity(text, index);
        if (entity) {
          parts.push(entity);
          index += entity.length - 1;
          continue;
        }
      }

      parts.push(escapeSlackTextCharacter(char));
      continue;
    }

    const closingIndex = text.indexOf(">", index + 1);
    const newlineIndex = text.indexOf("\n", index + 1);
    const hasClosingTagOnSameLine =
      closingIndex !== -1 &&
      (newlineIndex === -1 || closingIndex < newlineIndex);

    if (hasClosingTagOnSameLine) {
      const tagName = getHtmlTagName(text.slice(index + 1, closingIndex));

      if (tagName === "br" || tagName === "/li") {
        parts.push("\n");
      } else if (tagName === "li") {
        parts.push("• ");
      } else if (
        tagName === "p" ||
        tagName === "div" ||
        tagName === "blockquote" ||
        tagName === "section" ||
        tagName === "article" ||
        tagName === "ul" ||
        tagName === "ol"
      ) {
        // Strip structural opening tags while keeping their contents.
      } else if (
        tagName === "/p" ||
        tagName === "/div" ||
        tagName === "/blockquote" ||
        tagName === "/section" ||
        tagName === "/article" ||
        tagName === "/ul" ||
        tagName === "/ol"
      ) {
        parts.push("\n");
      } else {
        parts.push(escapeSlackText(text.slice(index, closingIndex + 1)));
      }

      index = closingIndex;
      continue;
    }

    parts.push("&lt;");
  }

  return parts.join("");
}

function getHtmlTagName(tagContents: string): string {
  const normalized = tagContents.trim().replace(/\/$/, "");
  const match = normalized.match(/^\/?[a-z0-9-]+/i);
  return match ? match[0].toLowerCase() : "";
}

export function escapeSlackText(text: string): string {
  return text.replace(/[&<>]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    return "&gt;";
  });
}

function escapeSlackTextCharacter(char: string): string {
  if (char === "&") return "&amp;";
  if (char === ">") return "&gt;";
  if (char === "<") return "&lt;";
  return char;
}

function readHtmlEntity(text: string, index: number): string | null {
  const remainder = text.slice(index);
  const match = remainder.match(
    /^&(?:[a-zA-Z][a-zA-Z0-9]+|#\d+|#x[0-9a-fA-F]+);/,
  );
  return match?.[0] ?? null;
}

function createSlackLinkToken({
  sourceText,
  links,
}: {
  sourceText: string;
  links: Array<{ token: string; replacement: string }>;
}): string {
  let suffix = links.length;

  while (true) {
    const token = `__SLACK_LINK_TOKEN_${suffix}__`;

    if (
      !sourceText.includes(token) &&
      !links.some((link) => link.token === token)
    ) {
      return token;
    }

    suffix += 1;
  }
}

function sanitizeSlackLinkHref(href: string): string | null {
  try {
    const url = new URL(href);

    if (!["http:", "https:", "mailto:"].includes(url.protocol)) {
      return null;
    }

    return url.toString().replace(/[|<>]/g, encodeURIComponent);
  } catch {
    return null;
  }
}
