import { BRAND_NAME } from "@/utils/branding";

const REFERRAL_SIGNATURE_PREFIX = "Drafted by";
const REFERRAL_SIGNATURE_PRODUCT = "Inbox Zero";

const REFERRAL_SIGNATURE_PATTERN = createSignaturePatterns(
  REFERRAL_SIGNATURE_PREFIX,
  REFERRAL_SIGNATURE_PRODUCT,
);
const SENT_WITH_SIGNATURE_PATTERN = createSignaturePatterns(
  "Sent with",
  BRAND_NAME,
);

export function stripBrandingSignatures(value: string) {
  return stripReferralSignature(value)
    .replace(getSignaturePattern(value, SENT_WITH_SIGNATURE_PATTERN), "")
    .trim();
}

export function renderReferralSignatureHtml(referralLink: string) {
  return `${REFERRAL_SIGNATURE_PREFIX} <a href="${referralLink}">${REFERRAL_SIGNATURE_PRODUCT}</a>.`;
}

export function hasReferralSignature(value: string) {
  return (
    value.search(getSignaturePattern(value, REFERRAL_SIGNATURE_PATTERN)) !== -1
  );
}

export function stripReferralSignature(value: string) {
  return value
    .replace(getSignaturePattern(value, REFERRAL_SIGNATURE_PATTERN), "")
    .trim();
}

function getSignaturePattern(
  value: string,
  patterns: { text: RegExp; html: RegExp },
) {
  return /<\/?[a-z][^<>]*>/i.test(value) ? patterns.html : patterns.text;
}

function createSignaturePatterns(prefix: string, product: string) {
  const signature = `${escapeRegExp(prefix)}\\s+(?:<a\\b[^<>]*>)?${escapeRegExp(product)}(?:</a>)?(?:\\s*\\[https?://[^\\]\\s]+\\])?\\.?`;
  return {
    text: new RegExp(
      `(?<=^|[\\r\\n])[^\\S\\r\\n]*${signature}(?=[^\\S\\r\\n]*(?:$|[\\r\\n]))`,
      "gi",
    ),
    html: new RegExp(
      `(?<=^|[\\r\\n>])[^\\S\\r\\n]*${signature}(?=[^\\S\\r\\n]*(?:$|[\\r\\n<]))`,
      "gi",
    ),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
