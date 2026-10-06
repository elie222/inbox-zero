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
 * "Sent from my iPhone" while text/plain has the message. Readers prefer HTML,
 * so either shape shows the signature and drops the text the list snippet came
 * from.
 */
export function gmailMessageBodies(
  payload: Part | null | undefined,
  snippet?: string | null,
): { html?: string; plain?: string } {
  const collected = collect(payload);
  const plain = joinPlain(collected.plain);
  let html = joinHtml(collected.html);
  if (html && plain && htmlOmitsPlainMessage(html, plain, snippet)) {
    html = undefined;
  }
  return {
    html: html || undefined,
    plain: plain || undefined,
  };
}

function collect(part: Part | null | undefined): Collected {
  if (!part) return { html: [], plain: [] };
  const mime = part.mimeType?.toLowerCase() ?? "";
  if (part.parts?.length && (mime.startsWith("multipart/") || mime === "")) {
    const children = part.parts.map(collect);
    // Alternatives are the same message in two formats. Mixed and related
    // parts are sequential pieces of one message, split around images.
    if (mime === "multipart/alternative") return preferAlternative(children);
    return {
      html: children.flatMap((child) => child.html),
      plain: children.flatMap((child) => child.plain),
    };
  }
  if (isAttachment(part)) return { html: [], plain: [] };
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
  try {
    return Buffer.from(data, "base64url").toString("utf8");
  } catch {
    return "";
  }
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
  const match = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  return match?.[1] ?? html;
}

/**
 * The HTML part is a fragment of the plain message (the signature) when the
 * list snippet is in the plain text and missing from the HTML.
 */
function htmlOmitsPlainMessage(
  html: string,
  plain: string,
  snippet?: string | null,
) {
  const visible = visibleText(html);
  const plainText = normalize(plain);
  if (!visible) return false;
  if (!plainText.includes(visible)) return false;
  if (plainText.length < visible.length + 24) return false;
  const probe = normalize(snippet || plain).slice(0, 48);
  if (probe.length < 16) return false;
  return !visible.includes(probe);
}

function visibleText(html: string) {
  return normalize(
    html
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"'),
  );
}

function normalize(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}
