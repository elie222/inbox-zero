import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import { sanitizeEmailBodyHtml } from "./email-body";
import { isSafeContentId, isRemoteImageSource } from "./email-profile";

export const EMAIL_ATTACHMENT_LIMITS = {
  maxFiles: 10,
  maxInlineFiles: 5,
  maxFileBytes: 10 * 1024 * 1024,
  maxInlineBytes: 3 * 1024 * 1024,
  maxTotalBytes: 15 * 1024 * 1024,
} as const;

export const EMAIL_INLINE_IMAGE_MIME_TYPES = [
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type EmailInlineImageMimeType =
  (typeof EMAIL_INLINE_IMAGE_MIME_TYPES)[number];

export type EmailComposerAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  contentBase64: string;
  disposition: "attachment" | "inline";
  contentId?: string;
};

export type EmailAttachmentMetadata = Omit<
  EmailComposerAttachment,
  "contentBase64"
>;

// "original" HTML is sent exactly as it was loaded; "edited" HTML came from
// the editor and is sanitized before sending.
export type EmailBodyMode = "original" | "edited";

export type PreparedEmailDraft = {
  editableHtml: string;
  mode: EmailBodyMode;
  quotedHtml: string;
  signatureHtml: string;
};

const INLINE_IMAGE_MIME_TYPES = new Set<string>(EMAIL_INLINE_IMAGE_MIME_TYPES);

type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

/**
 * Splits a provider draft into editable body, signature and quote. The body
 * stays as provider HTML: the editor sanitizes it for display, and an
 * untouched draft is sent exactly as it was.
 */
export function prepareEmailDraft({
  html,
  quotedHtml,
  signatureHtml,
}: {
  html: string;
  quotedHtml?: string;
  signatureHtml?: string;
}): PreparedEmailDraft {
  const source = html || "";
  if (!source) {
    return {
      editableHtml: "",
      mode: "original",
      quotedHtml: quotedHtml ?? "",
      signatureHtml: signatureHtml?.trim() ?? "",
    };
  }
  const quoteSplit = quotedHtml
    ? { editableHtml: source, quotedHtml }
    : splitQuotedHtml(source);
  const signatureSplit = splitSignatureHtml({
    html: quoteSplit.editableHtml,
    knownSignatureHtml: signatureHtml,
  });
  return {
    editableHtml: signatureSplit.editableHtml,
    mode: "original",
    quotedHtml: quoteSplit.quotedHtml,
    signatureHtml: signatureSplit.signatureHtml,
  };
}

export function combineEmailHtml({
  editableHtml,
  quotedHtml,
  signatureHtml,
}: {
  editableHtml: string;
  quotedHtml?: string;
  signatureHtml?: string;
}) {
  return [editableHtml, signatureHtml, quotedHtml]
    .filter((part): part is string => Boolean(part?.trim()))
    .join("<br>");
}

export function finalizeEditableEmailHtml({
  html,
  inlineAttachments,
  mode,
}: {
  html: string;
  inlineAttachments: Pick<
    EmailAttachmentMetadata,
    "disposition" | "contentId"
  >[];
  mode: EmailBodyMode;
}) {
  if (mode === "original") return html;

  const contentIds = new Set(
    inlineAttachments
      .filter((attachment) => attachment.disposition === "inline")
      .map((attachment) => attachment.contentId)
      .filter((contentId): contentId is string => Boolean(contentId)),
  );
  const fragment = parseFragment(html);

  visitElements(fragment, (element) => {
    if (element.tagName !== "img") return;

    const contentId = getAttribute(element, "data-content-id");
    const source = getAttribute(element, "src") ?? "";
    if (contentId && contentIds.has(contentId)) {
      setAttribute(element, "src", `cid:${contentId}`);
      removeAttribute(element, "data-content-id");
      return;
    }

    if (source.startsWith("blob:") || source.startsWith("data:")) {
      removeNode(element);
    }
  });

  return sanitizeEmailBodyHtml(serialize(fragment));
}

/**
 * Prepares quoted or protected HTML for a read-only preview: the email body
 * profile, with remote images left unloaded so opening a quote cannot tell
 * the sender anything.
 */
export function sanitizePreservedEmailHtmlForPreview(html: string) {
  const fragment = parseFragment(sanitizeEmailBodyHtml(html));
  visitElements(fragment, (element) => {
    if (element.tagName !== "img") return;
    if (isRemoteImageSource(getAttribute(element, "src") ?? "")) {
      removeAttribute(element, "src");
    }
  });
  return serialize(fragment);
}

export function detectInlineImageMimeType(
  contentBase64: string,
): EmailInlineImageMimeType | null {
  const bytes = decodeBase64Prefix(contentBase64, 12);
  if (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
    startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  ) {
    return "image/gif";
  }
  if (
    bytes.length >= 12 &&
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWithBytes(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  return null;
}

export function createInlineContentId(domain = "inboxzero.local") {
  if (!/^[a-z\d.-]+$/iu.test(domain) || domain.length > 200) {
    throw new Error("Content-ID domain is invalid.");
  }

  const randomId = globalThis.crypto?.randomUUID?.();
  const localPart =
    randomId ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12).padEnd(10, "0")}`;
  return `${localPart}@${domain}`;
}

export function validateEmailAttachments(
  attachments: EmailComposerAttachment[],
): { valid: true } | { valid: false; error: string } {
  const metadataValidation = validateEmailAttachmentMetadata(attachments);
  if (!metadataValidation.valid) return metadataValidation;

  for (const attachment of attachments) {
    if (!isBase64(attachment.contentBase64)) {
      return { valid: false, error: "Attachment content is invalid." };
    }
    if (decodedBase64Size(attachment.contentBase64) !== attachment.size) {
      return {
        valid: false,
        error: "Attachment sizes do not match their content.",
      };
    }
    if (
      attachment.disposition === "inline" &&
      !matchesInlineImageType(attachment)
    ) {
      return {
        valid: false,
        error: "Inline image content does not match its file type.",
      };
    }
  }

  return { valid: true };
}

export function validateEmailAttachmentMetadata(
  attachments: EmailAttachmentMetadata[],
): { valid: true } | { valid: false; error: string } {
  if (attachments.length > EMAIL_ATTACHMENT_LIMITS.maxFiles) {
    return {
      valid: false,
      error: `Attach at most ${EMAIL_ATTACHMENT_LIMITS.maxFiles} files.`,
    };
  }

  const inlineAttachments = attachments.filter(
    (attachment) => attachment.disposition === "inline",
  );
  if (inlineAttachments.length > EMAIL_ATTACHMENT_LIMITS.maxInlineFiles) {
    return {
      valid: false,
      error: `Insert at most ${EMAIL_ATTACHMENT_LIMITS.maxInlineFiles} inline images.`,
    };
  }

  const seenIds = new Set<string>();
  const seenContentIds = new Set<string>();
  let totalBytes = 0;

  for (const attachment of attachments) {
    if (seenIds.has(attachment.id)) {
      return { valid: false, error: "Attachment IDs must be unique." };
    }
    seenIds.add(attachment.id);

    if (!attachment.filename.trim()) {
      return { valid: false, error: "Attachments must have a filename." };
    }
    if (!Number.isSafeInteger(attachment.size) || attachment.size < 0) {
      return { valid: false, error: "Attachment sizes are invalid." };
    }
    if (attachment.size > EMAIL_ATTACHMENT_LIMITS.maxFileBytes) {
      return {
        valid: false,
        error: "Attachments must be 10 MB or smaller.",
      };
    }
    totalBytes += attachment.size;
    if (attachment.disposition !== "inline") continue;

    if (attachment.size > EMAIL_ATTACHMENT_LIMITS.maxInlineBytes) {
      return {
        valid: false,
        error: "Inline images must be 3 MB or smaller.",
      };
    }
    if (!INLINE_IMAGE_MIME_TYPES.has(attachment.mimeType)) {
      return {
        valid: false,
        error: "Inline images must be PNG, JPEG, GIF, or WebP files.",
      };
    }
    if (!attachment.contentId || !isSafeContentId(attachment.contentId)) {
      return {
        valid: false,
        error: "Inline images require a valid Content-ID.",
      };
    }
    if (seenContentIds.has(attachment.contentId)) {
      return {
        valid: false,
        error: "Inline image Content-IDs must be unique.",
      };
    }
    seenContentIds.add(attachment.contentId);
  }

  if (totalBytes > EMAIL_ATTACHMENT_LIMITS.maxTotalBytes) {
    return {
      valid: false,
      error: "Attachments must total 15 MB or less.",
    };
  }

  return { valid: true };
}

function splitQuotedHtml(html: string) {
  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  const quote = findElement(fragment, isQuoteContainer);
  const startOffset = quote?.sourceCodeLocation?.startOffset;
  if (startOffset === undefined) {
    return { editableHtml: html, quotedHtml: "" };
  }

  return {
    editableHtml: stripTrailingBreaks(html.slice(0, startOffset)),
    quotedHtml: html.slice(startOffset),
  };
}

function splitSignatureHtml({
  html,
  knownSignatureHtml,
}: {
  html: string;
  knownSignatureHtml?: string;
}) {
  const knownSignature = knownSignatureHtml?.trim();
  if (knownSignature) {
    const knownStart = html.lastIndexOf(knownSignature);
    if (knownStart >= 0) {
      return {
        editableHtml: removeRange(
          html,
          knownStart,
          knownStart + knownSignature.length,
        ),
        signatureHtml: knownSignature,
      };
    }
  }

  const fragment = parseFragment(html, { sourceCodeLocationInfo: true });
  const signature = findElement(fragment, isSignatureContainer);
  const location = signature?.sourceCodeLocation;
  if (!signature || !location) {
    return {
      editableHtml: html,
      signatureHtml: knownSignature ?? "",
    };
  }

  let startOffset = location.startOffset;
  const prefix = html.slice(0, startOffset);
  const signaturePrefix = prefix.match(
    /<span\b[^>]*class=(?:"[^"]*gmail_signature_prefix[^"]*"|'[^']*gmail_signature_prefix[^']*')[^>]*>[\s\S]*?<\/span>\s*<br\s*\/?>\s*$/iu,
  );
  if (signaturePrefix?.index !== undefined) {
    startOffset = signaturePrefix.index;
  }

  return {
    editableHtml: removeRange(html, startOffset, location.endOffset),
    signatureHtml: html.slice(startOffset, location.endOffset),
  };
}

function isQuoteContainer(element: Element) {
  const classes = classTokens(element);
  const id = (getAttribute(element, "id") ?? "").toLowerCase();
  const style = (getAttribute(element, "style") ?? "").toLowerCase();

  return (
    classes.has("gmail_quote") ||
    classes.has("gmail_quote_container") ||
    id === "divrplyfwdmsg" ||
    id === "x_divrplyfwdmsg" ||
    id === "appendonsend" ||
    (element.tagName === "blockquote" &&
      getAttribute(element, "type") === "cite") ||
    (element.tagName === "div" && style.includes("border-top"))
  );
}

function isSignatureContainer(element: Element) {
  const classes = classTokens(element);
  const id = (getAttribute(element, "id") ?? "").toLowerCase();

  return (
    classes.has("gmail_signature") ||
    classes.has("ms-outlook-signature") ||
    id === "signature" ||
    element.attrs.some((attribute) => attribute.name === "data-smartmail")
  );
}

function findElement(
  parent: ParentNode,
  predicate: (element: Element) => boolean,
): Element | undefined {
  for (const node of parent.childNodes) {
    if (!isElement(node)) continue;
    if (predicate(node)) return node;
    const match = findElement(node, predicate);
    if (match) return match;
  }
}

function visitElements(
  parent: ParentNode,
  visitor: (element: Element) => void,
) {
  for (const node of [...parent.childNodes]) {
    if (!isElement(node)) continue;
    visitor(node);
    if (node.parentNode) visitElements(node, visitor);
  }
}

function removeNode(node: Element) {
  const parent = node.parentNode;
  if (!parent) return;
  parent.childNodes = parent.childNodes.filter((child) => child !== node);
  node.parentNode = null;
}

function removeRange(html: string, start: number, end: number) {
  return `${html.slice(0, start)}${html.slice(end)}`;
}

function isBase64(value: string) {
  const normalized = value.trim();
  if (!normalized) return true;
  return (
    normalized.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/u.test(normalized)
  );
}

function decodedBase64Size(value: string) {
  const normalized = value.trim();
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;
  return (normalized.length * 3) / 4 - padding;
}

function matchesInlineImageType(attachment: EmailComposerAttachment) {
  return (
    detectInlineImageMimeType(attachment.contentBase64) === attachment.mimeType
  );
}

function decodeBase64Prefix(value: string, byteCount: number) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes: number[] = [];
  let buffer = 0;
  let bitCount = 0;

  for (const character of value.trim()) {
    if (character === "=") break;
    const digit = alphabet.indexOf(character);
    if (digit < 0) return [];
    buffer = buffer * 64 + digit;
    bitCount += 6;
    if (bitCount < 8) continue;

    bitCount -= 8;
    const divisor = 2 ** bitCount;
    bytes.push(Math.floor(buffer / divisor) % 256);
    buffer %= divisor;
    if (bytes.length === byteCount) break;
  }

  return bytes;
}

function startsWithBytes(value: number[], prefix: number[]) {
  return prefix.every((byte, index) => value[index] === byte);
}

function classTokens(element: Element) {
  return new Set(
    (getAttribute(element, "class") ?? "")
      .split(/\s+/u)
      .map((token) => token.trim())
      .filter(Boolean),
  );
}

function getAttribute(element: Element, name: string) {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

function setAttribute(element: Element, name: string, value: string) {
  const attribute = element.attrs.find((candidate) => candidate.name === name);
  if (attribute) {
    attribute.value = value;
  } else {
    element.attrs.push({ name, value });
  }
}

function removeAttribute(element: Element, name: string) {
  element.attrs = element.attrs.filter((attribute) => attribute.name !== name);
}

function stripTrailingBreaks(html: string) {
  let end = html.length;
  let foundBreak = false;

  while (end > 0) {
    while (end > 0) {
      const character = html.at(end - 1);
      if (character === undefined || character.trim() !== "") break;
      end--;
    }

    const tagStart = html.lastIndexOf("<", end - 1);
    if (tagStart < 0 || !isBreakTag(html, tagStart, end)) break;
    foundBreak = true;
    end = tagStart;
  }

  return foundBreak ? html.slice(0, end) : html;
}

function isBreakTag(html: string, start: number, end: number) {
  if (
    html.at(start) !== "<" ||
    html.at(start + 1)?.toLowerCase() !== "b" ||
    html.at(start + 2)?.toLowerCase() !== "r"
  ) {
    return false;
  }

  let index = start + 3;
  while (index < end - 1) {
    const character = html.at(index);
    if (character === undefined || character.trim() !== "") break;
    index++;
  }
  if (html.at(index) === "/") index++;
  return index === end - 1 && html.at(index) === ">";
}

function isElement(node: ChildNode): node is Element {
  return "tagName" in node;
}
