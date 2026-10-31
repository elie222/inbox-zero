import type { GetSignatureResponse } from "@/app/api/user/signature/route";
import { stripBrandingSignatures } from "@/utils/referral/signature";

const SIGNATURE_CONTAINER = "[data-smartmail]";

// Signatures are compared by their text, so the composer's wrapper, its blank
// separator line and the "Sent with" footer don't stop a match.
export function findSignatureId(
  signatures: GetSignatureResponse["signatures"],
  signatureHtml: string,
) {
  const key = getSignatureKey(signatureHtml);
  if (!key) return;
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
  return getSignatureText(stripBrandingSignatures(html));
}

export function getSignatureText(html: string) {
  const spaced = html.replace(/<(br|\/div|\/p|\/li|\/tr)\b[^>]*>/gi, "$& ");
  const text =
    new DOMParser().parseFromString(spaced, "text/html").body.textContent ?? "";
  return text.replace(/\s+/g, " ").trim();
}
