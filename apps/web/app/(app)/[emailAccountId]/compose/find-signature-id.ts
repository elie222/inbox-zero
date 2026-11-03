import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import { stripBrandingSignatures } from "@/utils/referral/signature";

const SIGNATURE_CONTAINER = "[data-smartmail]";
const BLANK_LINE = String.raw`\s|<div>(?:<br\s*/?>)?</div>|<br\s*/?>`;
const EDGE_BLANK_LINES = new RegExp(
  `^(?:${BLANK_LINE})+|(?:${BLANK_LINE})+$`,
  "gi",
);

// Ignore composer wrappers, spacers and branding before comparing text
// or matching image-only signatures by their HTML.
export function findSignatureId(
  signatures: GetSignatureResponse["signatures"],
  signatureHtml: string,
) {
  const html = cleanSignatureHtml(signatureHtml);
  const key = getSignatureText(html);
  if (!key) {
    if (!html) return;
    return signatures.find(
      (item) => cleanSignatureHtml(item.signatureHtml) === html,
    )?.id;
  }
  return signatures.find((item) => getSignatureKey(item.signatureHtml) === key)
    ?.id;
}

// An edited draft holds the signature the user last picked in its body, which
// is newer than the signature it was first opened with.
export function getDraftSignatureHtml(draft: {
  editableHtml: string;
  signatureHtml?: string;
}) {
  const container = new DOMParser()
    .parseFromString(draft.editableHtml, "text/html")
    .querySelector(SIGNATURE_CONTAINER);
  return container?.innerHTML ?? draft.signatureHtml ?? "";
}

function getSignatureKey(html: string) {
  return getSignatureText(cleanSignatureHtml(html));
}

export function getSignatureText(html: string) {
  const spaced = html.replace(/<(br|\/div|\/p|\/li|\/tr)\b[^>]*>/gi, "$& ");
  const text =
    new DOMParser().parseFromString(spaced, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}

function cleanSignatureHtml(html: string) {
  const signature = getDraftSignatureHtml({
    editableHtml: html,
    signatureHtml: html,
  });
  return stripBrandingSignatures(signature).replace(EDGE_BLANK_LINES, "");
}
