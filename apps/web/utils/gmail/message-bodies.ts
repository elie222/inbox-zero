import type { gmail_v1 } from "@googleapis/gmail";

type Part = gmail_v1.Schema$MessagePart;

type Collected = {
  html: string[];
  plain: string[];
};

/**
 * Gmail's message parser keeps only the last text part. Apple Mail does not
 * send one part: a photo in the middle splits the message into several
 * text/plain or text/html parts, and the HTML alternative is sometimes only
 * the signature while text/plain has the message. Readers prefer HTML, so
 * either shape shows the signature and drops the text the list snippet came
 * from.
 */
export function gmailMessageBodies(
  payload: Part | null | undefined,
  snippet?: string | null,
): { html?: string; plain?: string } {
  const collected = collect(payload);
  const plain = joinPlain(collected.plain);
  let html: string | undefined = joinHtml(collected.html) || undefined;
  if (html && plain && htmlOmitsPlainMessage(html, plain, snippet)) {
    html = undefined;
  }
  return {
    html,
    plain: plain || undefined,
  };
}

function collect(part: Part | null | undefined): Collected {
  if (!part || isAttachment(part)) return { html: [], plain: [] };
  const mime = part.mimeType?.toLowerCase() ?? "";
  if (part.parts?.length) {
    const children = part.parts.map(collect);
    // Alternatives are two formats of one message. Every other container,
    // including multipart/mixed around an inline image, is sequential.
    if (mime === "multipart/alternative") return preferAlternative(children);
    return {
      html: children.flatMap((child) => child.html),
      plain: children.flatMap((child) => child.plain),
    };
  }
  const text = decodePart(part);
  if (!text) return { html: [], plain: [] };
  if (mime.includes("text/html")) return { html: [text], plain: [] };
  if (mime.includes("text/plain")) return { html: [], plain: [text] };
  return { html: [], plain: [] };
}

function preferAlternative(children: Collected[]): Collected {
  let html = "";
  let plain = "";
  for (const child of children) {
    const childHtml = joinHtml(child.html);
    const childPlain = joinPlain(child.plain);
    if (childHtml) html = childHtml;
    if (childPlain) plain = childPlain;
  }
  return {
    html: html ? [html] : [],
    plain: plain ? [plain] : [],
  };
}

function isAttachment(part: Part) {
  if (part.filename) return true;
  const disposition = header(part, "content-disposition")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (disposition === "attachment") return true;
  return Boolean(part.body?.attachmentId && !part.body.data);
}

function header(part: Part, name: string) {
  return part.headers?.find((item) => item.name?.toLowerCase() === name)?.value;
}

function decodePart(part: Part) {
  const data = part.body?.data;
  if (!data) return "";
  return Buffer.from(data, "base64url").toString("utf8");
}

function joinPlain(parts: string[]) {
  return parts
    .filter((part) => part.length > 0)
    .reduce((combined, part) => {
      if (!combined) return part;
      if (/\s$/.test(combined) || /^\s/.test(part)) return combined + part;
      return `${combined}\n${part}`;
    }, "");
}

function joinHtml(parts: string[]) {
  const present = parts.map((part) => part.trim()).filter(Boolean);
  if (present.length === 0) return "";
  if (present.length === 1) return present[0];
  return present.map(htmlBodyContents).join("\n");
}

function htmlBodyContents(html: string) {
  let index = 0;
  while (index < html.length) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      index = next === -1 ? html.length : next;
      continue;
    }
    const read = readTag(html, index);
    if (!read.tag) {
      index = read.resume;
      continue;
    }
    index = read.tag.end;
    if (read.tag.closing || read.tag.name !== "body") continue;
    const close = closingTag(html, index, "body");
    return html.slice(read.tag.end, close?.start ?? html.length);
  }
  return html;
}

/**
 * The HTML part is only the tail of the plain message, and that tail does
 * not contain the list snippet. A short reply qualifies: "Hi" in front of
 * the signature is enough. HTML that contains the snippet stays, which keeps
 * a formatted reply, a link, or a quoted thread.
 */
function htmlOmitsPlainMessage(
  html: string,
  plain: string,
  snippet?: string | null,
) {
  const plainText = normalize(plain);
  if (!plainText) return false;
  // A tail has to fit in the plain part. Markup with no tags or entities
  // is already the visible text, so a longer string cannot be that tail.
  if (html.indexOf("<") === -1 && html.indexOf("&") === -1) {
    const visible = normalize(html);
    if (visible.length > plainText.length) return false;
    return plainTailOmitsMessage(visible, plainText, snippet);
  }
  const visible = visibleText(html, plainText.length);
  if (!visible) return false;
  return plainTailOmitsMessage(visible, plainText, snippet);
}

function plainTailOmitsMessage(
  visible: string,
  plainText: string,
  snippet?: string | null,
) {
  if (
    !visible ||
    visible.length > plainText.length ||
    !plainText.endsWith(visible)
  ) {
    return false;
  }
  const prefix = plainText.slice(0, plainText.length - visible.length).trim();
  if (!prefix || visible.includes(prefix)) return false;
  const probe = normalize(snippet ?? "");
  if (probe && !prefix.startsWith(probe) && !probe.startsWith(prefix)) {
    return false;
  }
  return true;
}

/**
 * One left-to-right pass. Script and style bodies are skipped, including
 * `</script >`. Returns undefined once the visible text is longer than
 * `maxLength`, because that text cannot be a tail of the plain part.
 */
function visibleText(html: string, maxLength: number): string | undefined {
  const parts: string[] = [];
  let nonWhitespace = 0;
  let index = 0;

  const push = (chunk: string) => {
    if (!chunk) return false;
    parts.push(chunk);
    let cursor = 0;
    while (cursor < chunk.length) {
      const code = chunk.charCodeAt(cursor);
      // ASCII outside the `\s` controls and space cannot match `\s`.
      if (code <= 32 || code >= 0xa0) {
        if (!isWhitespace(chunk[cursor])) nonWhitespace++;
      } else {
        nonWhitespace++;
      }
      cursor++;
    }
    return nonWhitespace > maxLength;
  };

  while (index < html.length) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const end = next === -1 ? html.length : next;
      if (push(decodeEntitiesOnce(html.slice(index, end)))) return;
      index = end;
      continue;
    }
    if (html.startsWith("<!--", index)) {
      const commentEnd = html.indexOf("-->", index + 4);
      if (commentEnd === -1) break;
      index = commentEnd + 3;
      continue;
    }
    const read = readTag(html, index);
    if (!read.tag) {
      if (push(decodeEntitiesOnce(html.slice(index, read.resume)))) return;
      index = read.resume;
      continue;
    }
    push(" ");
    index = read.tag.end;
    if (
      !read.tag.closing &&
      (read.tag.name === "script" || read.tag.name === "style")
    ) {
      index = closingTag(html, index, read.tag.name)?.end ?? html.length;
    }
  }

  const visible = normalize(parts.join(""));
  if (!visible || visible.length > maxLength) return;
  return visible;
}

function closingTag(html: string, from: number, name: string) {
  let index = from;
  while (index < html.length) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      if (next === -1) return null;
      index = next;
      continue;
    }
    const read = readTag(html, index);
    if (read.tag?.closing && read.tag.name === name) {
      return { start: index, end: read.tag.end };
    }
    const resume = read.tag ? read.tag.end : read.resume;
    if (resume <= index) return null;
    index = resume;
  }
  return null;
}

/**
 * Reads the tag at `start`. The search for `>` stops at the next `<`, and
 * `resume` is the first index the caller has not already consumed.
 */
function readTag(
  html: string,
  start: number,
): {
  tag: { closing: boolean; name: string; end: number } | null;
  resume: number;
} {
  let index = start + 1;
  if (index >= html.length) return { tag: null, resume: html.length };

  let closing = false;
  if (html[index] === "/") {
    closing = true;
    index += 1;
    if (index >= html.length) return { tag: null, resume: html.length };
  }
  if (html[index] === "<") return { tag: null, resume: index };

  const nameStart = index;
  while (index < html.length && isTagNameChar(html[index], index > nameStart)) {
    index += 1;
  }
  if (index === nameStart) return { tag: null, resume: start + 1 };

  for (let end = index; end < html.length; end++) {
    const char = html[end];
    if (char === ">") {
      return {
        tag: {
          closing,
          name: html.slice(nameStart, index).toLowerCase(),
          end: end + 1,
        },
        resume: end + 1,
      };
    }
    if (char === "<") return { tag: null, resume: end };
  }
  return { tag: null, resume: html.length };
}

function findChar(value: string, char: string, from: number, limit: number) {
  const end = Math.min(value.length, limit);
  for (let index = from; index < end; index++) {
    if (value[index] === char) return index;
  }
  return -1;
}

function isTagNameChar(char: string | undefined, afterFirst: boolean) {
  if (!char) return false;
  const code = char.toLowerCase();
  if (code >= "a" && code <= "z") return true;
  return afterFirst && code >= "0" && code <= "9";
}

/** Each entity is decoded once, so `&amp;lt;` stays `&lt;`. */
function decodeEntitiesOnce(value: string) {
  let text = "";
  for (let index = 0; index < value.length; index++) {
    if (value[index] !== "&") {
      text += value[index];
      continue;
    }
    const semi = findChar(value, ";", index + 1, index + 12);
    if (semi === -1) {
      text += "&";
      continue;
    }
    const decoded = decodeEntity(value.slice(index + 1, semi));
    if (decoded == null) {
      text += "&";
      continue;
    }
    text += decoded;
    index = semi;
  }
  return text;
}

function decodeEntity(body: string) {
  switch (body.toLowerCase()) {
    case "amp":
      return "&";
    case "apos":
      return "'";
    case "gt":
      return ">";
    case "lt":
      return "<";
    case "nbsp":
      return " ";
    case "quot":
      return '"';
    default: {
      const numeric =
        /^#(\d{1,7})$/.exec(body) ?? /^#x([\da-f]{1,6})$/i.exec(body);
      if (!numeric) return null;
      const code = Number.parseInt(
        numeric[1],
        numeric[0][1]?.toLowerCase() === "x" ? 16 : 10,
      );
      if (
        !Number.isFinite(code) ||
        code < 0 ||
        code > 0x10_ff_ff ||
        (code >= 0xd8_00 && code <= 0xdf_ff)
      ) {
        return null;
      }
      return String.fromCodePoint(code);
    }
  }
}

/** Same characters as the `\s` class in `normalize`. */
function isWhitespace(char: string | undefined) {
  return char != null && /\s/.test(char);
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
