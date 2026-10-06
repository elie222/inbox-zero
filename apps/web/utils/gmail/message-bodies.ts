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
  for (let index = 0; index < html.length; index++) {
    if (html[index] !== "<") continue;
    const tag = readTag(html, index);
    if (!tag) continue;
    index = tag.end - 1;
    if (tag.closing || tag.name !== "body") continue;
    const close = closingTag(html, tag.end, "body");
    return html.slice(tag.end, close?.start ?? html.length);
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
  const visible = visibleText(html);
  const plainText = normalize(plain);
  if (!visible || !plainText.endsWith(visible)) return false;
  const prefix = plainText.slice(0, plainText.length - visible.length).trim();
  if (!prefix || visible.includes(prefix)) return false;
  const probe = normalize(snippet ?? "");
  if (probe && !prefix.startsWith(probe) && !probe.startsWith(prefix)) {
    return false;
  }
  return true;
}

/** One left-to-right pass. Script and style bodies are skipped, including `</script >`. */
function visibleText(html: string) {
  let text = "";
  for (let index = 0; index < html.length; index++) {
    if (html[index] !== "<") {
      const next = html.indexOf("<", index);
      const end = next === -1 ? html.length : next;
      text += decodeEntitiesOnce(html.slice(index, end));
      index = end - 1;
      continue;
    }
    if (html.startsWith("<!--", index)) {
      const commentEnd = html.indexOf("-->", index + 4);
      if (commentEnd === -1) break;
      index = commentEnd + 2;
      continue;
    }
    const tag = readTag(html, index);
    if (!tag) {
      text += "<";
      continue;
    }
    index = tag.end - 1;
    text += " ";
    if (!tag.closing && (tag.name === "script" || tag.name === "style")) {
      index = skipElement(html, tag.end, tag.name) - 1;
    }
  }
  return normalize(text);
}

function skipElement(html: string, from: number, name: string) {
  return closingTag(html, from, name)?.end ?? html.length;
}

function closingTag(html: string, from: number, name: string) {
  for (let index = from; index < html.length; index++) {
    if (html[index] !== "<") continue;
    const tag = readTag(html, index);
    if (!tag) continue;
    if (tag.closing && tag.name === name) return { start: index, end: tag.end };
    index = tag.end - 1;
  }
  return null;
}

function readTag(html: string, start: number) {
  if (html[start] !== "<") return null;
  let index = start + 1;
  let closing = false;
  if (html[index] === "/") {
    closing = true;
    index += 1;
  }
  const nameStart = index;
  while (index < html.length && isTagNameChar(html[index], index > nameStart)) {
    index += 1;
  }
  if (index === nameStart) return null;
  const end = findChar(html, ">", index, index + 2048);
  if (end === -1) return null;
  return {
    closing,
    name: html.slice(nameStart, index).toLowerCase(),
    end: end + 1,
  };
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

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
