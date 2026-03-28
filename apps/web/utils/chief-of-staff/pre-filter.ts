import { PreFilterResult, FilterReason } from "./types";

interface PreFilterInput {
  category: string | null;
  from: string;
  headers: Record<string, string>;
  labels: string[];
  subject: string;
}

interface PreFilterOptions {
  allowedDomains?: string[];
  blockedDomains?: string[];
}

interface PreFilterOutput {
  action: PreFilterResult;
  reason: FilterReason | null;
}

const SKIPPED_CATEGORIES = new Set(["promotions", "social", "forums"]);

const SHIPPING_SENDER_PATTERNS = [
  /ups\.com$/i,
  /fedex\.com$/i,
  /usps\.com$/i,
  /dhl\.com$/i,
  /amazon\.com$/i,
  /ship-confirm@/i,
  /shipment-tracking@/i,
  /tracking@/i,
];

const SHIPPING_SUBJECT_KEYWORDS = [
  "shipped",
  "has shipped",
  "out for delivery",
  "delivery",
  "tracking number",
  "your package",
  "order shipped",
  "shipment confirmation",
];

function extractDomain(email: string): string {
  const match = email.match(/@([^>]+)/);
  return match ? match[1].toLowerCase() : "";
}

function normalizeHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

function isShippingSender(from: string): boolean {
  return SHIPPING_SENDER_PATTERNS.some((pattern) => pattern.test(from));
}

function isShippingSubject(subject: string): boolean {
  const lower = subject.toLowerCase();
  return SHIPPING_SUBJECT_KEYWORDS.some((keyword) => lower.includes(keyword));
}

export function preFilter(
  input: PreFilterInput,
  options: PreFilterOptions = {},
): PreFilterOutput {
  const { from, subject, category, headers } = input;
  const { allowedDomains = [], blockedDomains = [] } = options;
  const normalizedHeaders = normalizeHeaders(headers);
  const senderDomain = extractDomain(from);

  // 1. Allowlist check — always PROCESS
  if (allowedDomains.some((d) => senderDomain === d.toLowerCase())) {
    return { action: PreFilterResult.PROCESS, reason: null };
  }

  // 2. Gmail category — promotions, social, forums → SKIP
  if (category && SKIPPED_CATEGORIES.has(category.toLowerCase())) {
    return {
      action: PreFilterResult.SKIP,
      reason: FilterReason.GMAIL_CATEGORY,
    };
  }

  // 3. Blocked domains → SKIP
  if (blockedDomains.some((d) => senderDomain === d.toLowerCase())) {
    return { action: PreFilterResult.SKIP, reason: FilterReason.BLOCKLIST };
  }

  // 4. Mailing list headers → SKIP
  if (normalizedHeaders["list-unsubscribe"] || normalizedHeaders["list-id"]) {
    return {
      action: PreFilterResult.SKIP,
      reason: FilterReason.MAILING_LIST,
    };
  }

  // 5. Bounce/delivery → SKIP
  const fromLower = from.toLowerCase();
  const contentType = normalizedHeaders["content-type"] ?? "";
  if (
    fromLower.includes("mailer-daemon@") ||
    fromLower.includes("postmaster@") ||
    contentType.includes("multipart/report")
  ) {
    return { action: PreFilterResult.SKIP, reason: FilterReason.BOUNCE };
  }

  // 6. Shipping → CREATE_CALENDAR_EVENT
  if (isShippingSender(from) || isShippingSubject(subject)) {
    return {
      action: PreFilterResult.CREATE_CALENDAR_EVENT,
      reason: FilterReason.SHIPPING,
    };
  }

  // 7. Gmail updates → BATCH_SUMMARY
  if (category?.toLowerCase() === "updates") {
    return {
      action: PreFilterResult.BATCH_SUMMARY,
      reason: FilterReason.BATCH_SUMMARY,
    };
  }

  // 8. Everything else → PROCESS
  return { action: PreFilterResult.PROCESS, reason: null };
}
