import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";

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

export type PreparedEmailDraft = {
  editableHtml: string;
  mode: "rich" | "fallback";
  quotedHtml: string;
  signatureHtml: string;
  unsupported: string[];
};

const BLOCK_TAGS = new Set(["blockquote", "div", "ol", "p", "ul"]);
const SUPPORTED_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "del",
  "div",
  "em",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "s",
  "span",
  "strike",
  "strong",
  "u",
  "ul",
]);
const INLINE_IMAGE_MIME_TYPES = new Set<string>(EMAIL_INLINE_IMAGE_MIME_TYPES);
const DANGEROUS_PREVIEW_TAGS = new Set([
  "audio",
  "base",
  "button",
  "embed",
  "form",
  "iframe",
  "input",
  "link",
  "meta",
  "object",
  "script",
  "style",
  "svg",
  "textarea",
  "video",
]);
const DANGEROUS_EDITABLE_TAGS = new Set([...DANGEROUS_PREVIEW_TAGS, "select"]);
const SAFE_PREVIEW_ATTRIBUTES = new Set([
  "abbr",
  "align",
  "alt",
  "border",
  "cellpadding",
  "cellspacing",
  "colspan",
  "dir",
  "height",
  "href",
  "lang",
  "rel",
  "role",
  "rowspan",
  "scope",
  "src",
  "style",
  "target",
  "title",
  "valign",
  "width",
]);
const SAFE_PREVIEW_STYLE_PROPERTIES = new Set([
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

type ChildNode = DefaultTreeAdapterTypes.ChildNode;
type Element = DefaultTreeAdapterTypes.Element;
type ParentNode = DefaultTreeAdapterTypes.ParentNode;

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
      mode: "rich",
      quotedHtml: quotedHtml ?? "",
      signatureHtml: signatureHtml?.trim() ?? "",
      unsupported: [],
    };
  }
  const quoteSplit = quotedHtml
    ? { editableHtml: source, quotedHtml }
    : splitQuotedHtml(source);
  const signatureSplit = splitSignatureHtml({
    html: quoteSplit.editableHtml,
    knownSignatureHtml: signatureHtml,
  });
  const unsupported = findUnsupportedEditableMarkup(
    signatureSplit.editableHtml,
  );

  if (unsupported.length > 0) {
    return {
      editableHtml: signatureSplit.editableHtml,
      mode: "fallback",
      quotedHtml: quoteSplit.quotedHtml,
      signatureHtml: signatureSplit.signatureHtml,
      unsupported,
    };
  }

  return {
    editableHtml: normalizeEditableEmailHtml(signatureSplit.editableHtml),
    mode: "rich",
    quotedHtml: quoteSplit.quotedHtml,
    signatureHtml: signatureSplit.signatureHtml,
    unsupported: [],
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
}: {
  html: string;
  inlineAttachments: EmailComposerAttachment[];
}) {
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

  const rewrittenHtml = serialize(fragment);
  const prepared = prepareEmailDraft({ html: rewrittenHtml });
  return prepared.editableHtml;
}

export function sanitizePreservedEmailHtmlForPreview(html: string) {
  const fragment = parseFragment(html);
  sanitizePreviewChildren(fragment);
  return serialize(fragment);
}

/**
 * Reduces untrusted draft HTML to the portable editable email profile.
 * Unsupported layout containers are unwrapped, while active content and
 * unsafe attributes are removed entirely.
 */
export function sanitizeEditableEmailHtml(html: string) {
  const fragment = parseFragment(html);
  sanitizeEditableChildren(fragment);
  return serialize(fragment);
}

export function canOpenEmailLink(value: string) {
  return /^(?:https?:|mailto:|tel:)/iu.test(value.trim());
}

export function normalizeEmailUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z\d+.-]*:/iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  return isSafeEmailUrl(candidate) ? candidate : null;
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

function findUnsupportedEditableMarkup(html: string) {
  const fragment = parseFragment(html);
  const unsupported = new Set<string>();

  for (const child of fragment.childNodes) {
    inspectNode(child, unsupported);
  }

  return [...unsupported].sort();
}

function inspectNode(node: ChildNode, unsupported: Set<string>) {
  if (node.nodeName === "#comment") {
    unsupported.add("comment");
    return;
  }
  if (!isElement(node)) return;

  if (!SUPPORTED_TAGS.has(node.tagName)) {
    unsupported.add(node.tagName);
    return;
  }

  const allowedAttributes = getAllowedEditableAttributes(node.tagName);
  for (const attribute of node.attrs) {
    if (attribute.name === "style") {
      if (!isSupportedStyle(node, attribute.value)) {
        unsupported.add(`${node.tagName}[style]`);
      }
      continue;
    }
    if (!allowedAttributes.has(attribute.name)) {
      unsupported.add(`${node.tagName}[${attribute.name}]`);
    }
  }

  if (node.tagName === "a") {
    const href = getAttribute(node, "href");
    if (href && !isSafeEmailUrl(href)) unsupported.add("a[href]");
  }
  if (node.tagName === "img") {
    const source = getAttribute(node, "src");
    if (!source || !isSafeImageSource(source)) unsupported.add("img[src]");
    const contentId = getAttribute(node, "data-content-id");
    if (contentId && !isSafeContentId(contentId)) {
      unsupported.add("img[data-content-id]");
    }
  }

  for (const child of node.childNodes) inspectNode(child, unsupported);
}

function normalizeEditableEmailHtml(html: string) {
  const fragment = parseFragment(html);
  return renderFlow(fragment.childNodes);
}

function renderFlow(nodes: ChildNode[], inheritedDirection?: string): string {
  let html = "";
  let inlineHtml = "";

  const flushInline = () => {
    if (!inlineHtml.trim()) {
      inlineHtml = "";
      return;
    }
    html += renderParagraph(inlineHtml, inheritedDirection);
    inlineHtml = "";
  };

  for (const node of nodes) {
    if (isElement(node) && BLOCK_TAGS.has(node.tagName)) {
      flushInline();
      html += renderBlock(node, inheritedDirection);
      continue;
    }
    inlineHtml += renderInline(node);
  }

  flushInline();
  return html;
}

function renderBlock(element: Element, inheritedDirection?: string): string {
  const direction = getDirection(element) ?? inheritedDirection;
  const directionAttribute = renderDirection(direction);

  if (element.tagName === "div") {
    if (element.childNodes.some(isBlockElement)) {
      return renderFlow(element.childNodes, direction);
    }
    return renderParagraph(renderInlineChildren(element), direction);
  }
  if (element.tagName === "p") {
    return `<p${directionAttribute}>${renderInlineChildren(element)}</p>`;
  }
  if (element.tagName === "blockquote") {
    return `<blockquote${directionAttribute}>${renderFlow(element.childNodes, direction)}</blockquote>`;
  }
  if (element.tagName === "ul" || element.tagName === "ol") {
    const start =
      element.tagName === "ol" ? renderIntegerAttribute(element, "start") : "";
    const items = element.childNodes
      .filter(
        (node): node is Element => isElement(node) && node.tagName === "li",
      )
      .map((item) => renderListItem(item, direction))
      .join("");
    return `<${element.tagName}${directionAttribute}${start}>${items}</${element.tagName}>`;
  }

  return "";
}

function renderListItem(element: Element, inheritedDirection?: string) {
  let html = "";
  let inlineHtml = "";

  for (const node of element.childNodes) {
    if (
      isElement(node) &&
      (node.tagName === "ul" ||
        node.tagName === "ol" ||
        node.tagName === "blockquote")
    ) {
      html += inlineHtml;
      inlineHtml = "";
      html += renderBlock(node, inheritedDirection);
      continue;
    }
    if (isElement(node) && (node.tagName === "p" || node.tagName === "div")) {
      inlineHtml += renderInlineChildren(node);
      continue;
    }
    inlineHtml += renderInline(node);
  }

  return `<li>${html}${inlineHtml}</li>`;
}

function renderInline(node: ChildNode): string {
  if ("value" in node) return escapeHtml(node.value);
  if (!isElement(node)) return "";

  if (node.tagName === "br") return "<br>";
  if (node.tagName === "img") return renderImage(node);

  const children = renderInlineChildren(node);
  if (node.tagName === "a") {
    const href = getAttribute(node, "href");
    if (!href || !isSafeEmailUrl(href)) return children;
    const title = renderOptionalAttribute(node, "title");
    return `<a href="${escapeAttribute(href)}"${title} target="_blank" rel="noopener noreferrer">${children}</a>`;
  }
  if (node.tagName === "b" || node.tagName === "strong") {
    return `<strong>${children}</strong>`;
  }
  if (node.tagName === "i" || node.tagName === "em") {
    return `<em>${children}</em>`;
  }
  if (
    node.tagName === "strike" ||
    node.tagName === "del" ||
    node.tagName === "s"
  ) {
    return `<s>${children}</s>`;
  }
  if (node.tagName === "u") return `<u>${children}</u>`;
  if (node.tagName === "span") return renderStyledSpan(node, children);

  return children;
}

function renderInlineChildren(element: Element) {
  return element.childNodes.map(renderInline).join("");
}

function renderStyledSpan(element: Element, children: string) {
  const declarations = parseStyle(getAttribute(element, "style") ?? "");
  let html = children;
  const decoration = declarations.get("text-decoration") ?? "";

  if (decoration.includes("line-through")) html = `<s>${html}</s>`;
  if (decoration.includes("underline")) html = `<u>${html}</u>`;
  if (declarations.get("font-style") === "italic") html = `<em>${html}</em>`;
  const fontWeight = declarations.get("font-weight") ?? "";
  if (fontWeight === "bold" || Number.parseInt(fontWeight, 10) >= 600) {
    html = `<strong>${html}</strong>`;
  }
  return html;
}

function renderImage(element: Element) {
  const source = getAttribute(element, "src");
  if (!source || !isSafeImageSource(source)) return "";

  return `<img src="${escapeAttribute(source)}"${renderContentIdAttribute(element)}${renderOptionalAttribute(element, "alt")}${renderOptionalAttribute(element, "title")}${renderPositiveIntegerAttribute(element, "width")}${renderPositiveIntegerAttribute(element, "height")}>`;
}

function renderParagraph(content: string, direction?: string) {
  return `<p${renderDirection(direction)}>${content}</p>`;
}

function sanitizePreviewChildren(parent: ParentNode) {
  parent.childNodes = parent.childNodes.filter((node) => {
    if (!isElement(node)) return node.nodeName !== "#comment";
    return !DANGEROUS_PREVIEW_TAGS.has(node.tagName);
  });

  for (const node of parent.childNodes) {
    if (!isElement(node)) continue;

    node.attrs = node.attrs.filter((attribute) => {
      if (
        !SAFE_PREVIEW_ATTRIBUTES.has(attribute.name) &&
        !attribute.name.startsWith("aria-")
      ) {
        return false;
      }
      if (attribute.name === "href") return isSafeEmailUrl(attribute.value);
      if (attribute.name === "src") {
        return (
          attribute.value.startsWith("cid:") ||
          /^data:image\/(?:gif|jpeg|png|webp);base64,/iu.test(attribute.value)
        );
      }
      if (attribute.name === "style") {
        attribute.value = sanitizePreviewStyle(attribute.value);
        return Boolean(attribute.value);
      }
      if (attribute.name === "target") {
        attribute.value = "_blank";
      }
      if (attribute.name === "rel") {
        attribute.value = "noopener noreferrer";
      }
      return true;
    });

    if (node.tagName === "a" && getAttribute(node, "href")) {
      setAttribute(node, "target", "_blank");
      setAttribute(node, "rel", "noopener noreferrer");
    }
    sanitizePreviewChildren(node);
  }
}

function sanitizeEditableChildren(parent: ParentNode) {
  const sanitizedChildren: ChildNode[] = [];

  for (const node of parent.childNodes) {
    if (node.nodeName === "#comment") continue;
    if (!isElement(node)) {
      sanitizedChildren.push(node);
      continue;
    }
    if (DANGEROUS_EDITABLE_TAGS.has(node.tagName)) continue;

    sanitizeEditableChildren(node);
    if (!SUPPORTED_TAGS.has(node.tagName)) {
      for (const child of node.childNodes) {
        child.parentNode = parent;
        sanitizedChildren.push(child);
      }
      continue;
    }
    if (!sanitizeEditableElement(node)) continue;
    sanitizedChildren.push(node);
  }

  parent.childNodes = sanitizedChildren;
}

function sanitizeEditableElement(element: Element) {
  const allowedAttributes = getAllowedEditableAttributes(element.tagName);
  element.attrs = element.attrs.filter((attribute) => {
    if (!allowedAttributes.has(attribute.name)) return false;
    if (attribute.name === "href") return isSafeEmailUrl(attribute.value);
    if (attribute.name === "src") {
      return isSafeEditableImageSource(attribute.value);
    }
    if (attribute.name === "data-content-id") {
      return isSafeContentId(attribute.value);
    }
    if (attribute.name === "width" || attribute.name === "height") {
      return isPositiveInteger(attribute.value);
    }
    if (attribute.name === "start") return /^-?\d+$/u.test(attribute.value);
    if (attribute.name === "dir") {
      return /^(?:ltr|rtl|auto)$/iu.test(attribute.value);
    }
    if (attribute.name === "style") {
      attribute.value = sanitizeEditableStyle(element.tagName, attribute.value);
      return Boolean(attribute.value);
    }
    return true;
  });

  if (element.tagName === "a") {
    if (getAttribute(element, "href")) {
      setAttribute(element, "target", "_blank");
      setAttribute(element, "rel", "noopener noreferrer");
    } else {
      removeAttribute(element, "target");
      removeAttribute(element, "rel");
    }
  }
  if (element.tagName === "img") {
    return Boolean(getAttribute(element, "src"));
  }
  return true;
}

function sanitizeEditableStyle(tagName: string, style: string) {
  const declarations = parseStyle(style);

  return [...declarations]
    .filter(([property, value]) => {
      if ((tagName === "div" || tagName === "p") && property === "direction") {
        return value === "ltr" || value === "rtl";
      }
      if (tagName !== "span") return false;
      if (property === "font-style") return value === "italic";
      if (property === "font-weight") {
        return value === "bold" || Number.parseInt(value, 10) >= 600;
      }
      if (property !== "text-decoration") return false;

      const tokens = value.split(/\s+/u).filter(Boolean);
      return (
        tokens.length > 0 &&
        tokens.every(
          (token) => token === "underline" || token === "line-through",
        )
      );
    })
    .map(([property, value]) => `${property}:${value}`)
    .join(";");
}

function sanitizePreviewStyle(style: string) {
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
        (!SAFE_PREVIEW_STYLE_PROPERTIES.has(property) && !isBoxProperty) ||
        normalizedValue.includes("url(") ||
        normalizedValue.includes("expression(") ||
        normalizedValue.includes("javascript:")
      ) {
        return "";
      }
      return `${property}:${value}`;
    })
    .filter(Boolean)
    .join(";");
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

function getAllowedEditableAttributes(tagName: string) {
  if (tagName === "a") return new Set(["href", "rel", "target", "title"]);
  if (tagName === "img") {
    return new Set([
      "alt",
      "data-content-id",
      "height",
      "src",
      "title",
      "width",
    ]);
  }
  if (tagName === "ol") return new Set(["dir", "start"]);
  if (tagName === "blockquote") return new Set(["dir"]);
  if (tagName === "div" || tagName === "p" || tagName === "ul") {
    return new Set(["dir", "style"]);
  }
  if (tagName === "span") return new Set(["style"]);
  return new Set<string>();
}

function isSupportedStyle(element: Element, style: string) {
  const declarations = parseStyle(style);
  if (declarations.size === 0) return true;

  if (element.tagName === "div" || element.tagName === "p") {
    return (
      declarations.size === 1 &&
      (declarations.get("direction") === "ltr" ||
        declarations.get("direction") === "rtl")
    );
  }
  if (element.tagName !== "span") return false;

  return [...declarations].every(([property, value]) => {
    if (property === "font-style") return value === "italic";
    if (property === "font-weight") {
      return value === "bold" || Number.parseInt(value, 10) >= 600;
    }
    if (property === "text-decoration") {
      const tokens = value.split(/\s+/u).filter(Boolean);
      return (
        tokens.length > 0 &&
        tokens.every(
          (token) => token === "underline" || token === "line-through",
        )
      );
    }
    return false;
  });
}

function parseStyle(style: string) {
  const declarations = new Map<string, string>();
  for (const declaration of style.split(";")) {
    const separator = declaration.indexOf(":");
    if (separator < 0) continue;
    const property = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration
      .slice(separator + 1)
      .trim()
      .toLowerCase();
    if (property && value) declarations.set(property, value);
  }
  return declarations;
}

function getDirection(element: Element) {
  const attribute = getAttribute(element, "dir")?.toLowerCase();
  if (attribute === "ltr" || attribute === "rtl" || attribute === "auto") {
    return attribute;
  }

  const styleDirection = parseStyle(getAttribute(element, "style") ?? "").get(
    "direction",
  );
  return styleDirection === "ltr" || styleDirection === "rtl"
    ? styleDirection
    : undefined;
}

export function isSafeEmailUrl(value: string) {
  const normalized = value.trim();
  return canOpenEmailLink(normalized) || normalized.startsWith("#");
}

function isSafeImageSource(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.startsWith("cid:") || normalized.startsWith("blob:");
}

function isSafeEditableImageSource(value: string) {
  const source = value.trim();
  if (/^(?:file|content|blob):/iu.test(source)) return true;
  if (source.startsWith("cid:")) {
    return isSafeContentId(source.slice(4));
  }
  return /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z\d+/]*={0,2}$/iu.test(
    source,
  );
}

function isPositiveInteger(value: string) {
  return /^\d+$/u.test(value) && Number(value) > 0;
}

function isSafeContentId(value: string) {
  return value.length <= 255 && /^[^<>\s]+$/u.test(value);
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

function renderDirection(direction?: string) {
  return direction ? ` dir="${direction}"` : "";
}

function renderOptionalAttribute(element: Element, name: string) {
  const value = getAttribute(element, name);
  return value ? ` ${name}="${escapeAttribute(value)}"` : "";
}

function renderContentIdAttribute(element: Element) {
  const contentId = getAttribute(element, "data-content-id");
  if (!contentId || !isSafeContentId(contentId)) return "";
  return ` data-content-id="${escapeAttribute(contentId)}"`;
}

function renderPositiveIntegerAttribute(element: Element, name: string) {
  const value = getAttribute(element, name);
  if (!value || !/^\d+$/u.test(value) || Number.parseInt(value, 10) <= 0) {
    return "";
  }
  return ` ${name}="${value}"`;
}

function renderIntegerAttribute(element: Element, name: string) {
  const value = getAttribute(element, name);
  if (!value || !/^-?\d+$/u.test(value)) return "";
  return ` ${name}="${value}"`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/\u00a0/gu, "&nbsp;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/"/gu, "&quot;");
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

function isBlockElement(node: ChildNode): node is Element {
  return isElement(node) && BLOCK_TAGS.has(node.tagName);
}
