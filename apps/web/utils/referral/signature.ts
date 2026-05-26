const REFERRAL_SIGNATURE_PREFIX = "Drafted by";
const REFERRAL_SIGNATURE_PRODUCT = "Inbox Zero";

const REFERRAL_SIGNATURE_PATTERN = new RegExp(
  `\\s*${escapeRegExp(REFERRAL_SIGNATURE_PREFIX)}\\s*(?:<a\\b[^>]*>)?${escapeRegExp(REFERRAL_SIGNATURE_PRODUCT)}(?:</a>)?\\.?\\s*`,
  "i",
);

export function renderReferralSignatureHtml(referralLink: string) {
  return `${REFERRAL_SIGNATURE_PREFIX} <a href="${referralLink}">${REFERRAL_SIGNATURE_PRODUCT}</a>.`;
}

export function hasReferralSignature(value: string) {
  return REFERRAL_SIGNATURE_PATTERN.test(value);
}

export function stripReferralSignature(value: string) {
  return value.replace(REFERRAL_SIGNATURE_PATTERN, "").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
