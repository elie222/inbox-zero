export type SendWarning =
  | { type: "missing-attachment" }
  | { type: "unfilled-placeholder"; placeholder: string };

// A warning, not a block: a word list is good enough to catch the common
// forgot-the-file case. Add a language by adding its words here.
const ATTACHMENT_MENTION =
  /\b(attach|attached|attaching|attachment|attachments|enclosed)\b|\b(adjunto|adjunta|adjuntos|adjuntas|anexo|anexos|anexado|anbei|anhang|angehängt|ci-joint|allegato|allegati|bijlage|bijgevoegd)\b|pièces? jointes?/iu;

// A signature or quoted thread can sit inside the editable body once it is
// edited; its text isn't what the user is about to send as new content.
const NOT_WRITTEN_BY_USER = [
  '[data-smartmail="gmail_signature"]',
  ".gmail_signature",
  ".gmail_signature_prefix",
  ".gmail_quote",
  "[data-email-preserved-kind]",
].join(",");

const PLACEHOLDER = /\[[^[\]\n]{1,60}\]/;

export function getSendWarnings({
  text,
  hasAttachments,
}: {
  text: string;
  hasAttachments: boolean;
}): SendWarning[] {
  const warnings: SendWarning[] = [];

  if (!hasAttachments && ATTACHMENT_MENTION.test(text)) {
    warnings.push({ type: "missing-attachment" });
  }

  const placeholder = text.match(PLACEHOLDER)?.[0];
  if (placeholder) {
    warnings.push({ type: "unfilled-placeholder", placeholder });
  }

  return warnings;
}

export function getEditableText(html: string) {
  const blockBreaks = html.replace(
    /<(br|\/p|\/div|\/li|\/h[1-6])\b[^>]*>/gi,
    "$&\n",
  );
  const body = new DOMParser().parseFromString(blockBreaks, "text/html").body;
  for (const element of body.querySelectorAll(NOT_WRITTEN_BY_USER)) {
    element.remove();
  }
  return body.textContent ?? "";
}
