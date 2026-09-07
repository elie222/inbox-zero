import { BRAND_NAME } from "@/utils/branding";

const REFERRAL_SIGNATURE_PREFIX = "Drafted by";
const REFERRAL_SIGNATURE_PRODUCT = "Inbox Zero";

const REFERRAL_SIGNATURE_PATTERN = createSignaturePattern(
  REFERRAL_SIGNATURE_PREFIX,
  REFERRAL_SIGNATURE_PRODUCT,
);
const SENT_WITH_SIGNATURE_PATTERN = createSignaturePattern(
  "Sent with",
  BRAND_NAME,
);

export function stripBrandingSignatures(value: string) {
  return stripReferralSignature(value)
    .replace(SENT_WITH_SIGNATURE_PATTERN, "")
    .trim();
}

export function renderReferralSignatureHtml(referralLink: string) {
  return `${REFERRAL_SIGNATURE_PREFIX} <a href="${referralLink}">${REFERRAL_SIGNATURE_PRODUCT}</a>.`;
}

export function hasReferralSignature(value: string) {
  return value.search(REFERRAL_SIGNATURE_PATTERN) !== -1;
}

export function stripReferralSignature(value: string) {
  return value.replace(REFERRAL_SIGNATURE_PATTERN, "").trim();
}

function createSignaturePattern(prefix: string, product: string) {
  return new RegExp(
    `${escapeRegExp(prefix)}\\s*(?:<a\\b[^>]*>)?${escapeRegExp(product)}(?:</a>)?(?:\\s*\\[https?://[^\\]]+\\])?\\.?`,
    "gi",
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
