import { BRAND_NAME } from "@/utils/branding";

const REFERRAL_SIGNATURE_PREFIX = "Drafted by";
const REFERRAL_SIGNATURE_PRODUCT = "Inbox Zero";

type SignaturePatterns = { text: RegExp; html: RegExp };

// Built on first use so importing this module reads no env (BRAND_NAME).
let referralSignaturePattern: SignaturePatterns | undefined;
let sentWithSignaturePattern: SignaturePatterns | undefined;

export function stripBrandingSignatures(value: string) {
  return stripReferralSignature(value)
    .replace(getSignaturePattern(value, getSentWithSignaturePattern()), "")
    .trim();
}

export function renderReferralSignatureHtml(referralLink: string) {
  return `${REFERRAL_SIGNATURE_PREFIX} <a href="${referralLink}">${REFERRAL_SIGNATURE_PRODUCT}</a>.`;
}

export function hasReferralSignature(value: string) {
  return (
    value.search(getSignaturePattern(value, getReferralSignaturePattern())) !==
    -1
  );
}

export function stripReferralSignature(value: string) {
  return value
    .replace(getSignaturePattern(value, getReferralSignaturePattern()), "")
    .trim();
}

function getReferralSignaturePattern() {
  referralSignaturePattern ??= createSignaturePatterns(
    REFERRAL_SIGNATURE_PREFIX,
    REFERRAL_SIGNATURE_PRODUCT,
  );
  return referralSignaturePattern;
}

function getSentWithSignaturePattern() {
  sentWithSignaturePattern ??= createSignaturePatterns("Sent with", BRAND_NAME);
  return sentWithSignaturePattern;
}

function getSignaturePattern(value: string, patterns: SignaturePatterns) {
  return /<\/?(?:html|body|div|p|br|span|a)(?:\s[^<>]*|\/?)>/i.test(value)
    ? patterns.html
    : patterns.text;
}

function createSignaturePatterns(prefix: string, product: string) {
  const signature = `${escapeRegExp(prefix)}\\s+(?:<a\\b[^<>]*>)?${escapeRegExp(product)}(?:</a>)?(?:\\s*\\[https?://[^\\]\\s]+\\])?\\.?`;
  return {
    text: new RegExp(
      `(?<=^|[\\r\\n])[^\\S\\r\\n]*${signature}(?=[^\\S\\r\\n]*(?:$|[\\r\\n]))`,
      "gi",
    ),
    // Leading line breaks go with the footer, or the body keeps a blank line
    // where it was. Matching only from the first break in a run keeps long
    // runs without a footer linear.
    html: new RegExp(
      `(?:(?<!<br\\s*\\/?>\\s*)(?:<br\\s*\\/?>\\s*)+|(?<=^|[\\r\\n>])[^\\S\\r\\n]*)${signature}(?=[^\\S\\r\\n]*(?:$|[\\r\\n<]))`,
      "gi",
    ),
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
