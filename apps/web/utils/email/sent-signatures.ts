import { load } from "cheerio";
import type { EmailProvider } from "@/utils/email/types";
import { getOwnSignatureHtml } from "@/utils/email/signature-normalization";
import { stripBrandingSignatures } from "@/utils/referral/signature";

const SENT_MESSAGES_TO_SCAN = 30;
const MAX_FOUND_SIGNATURES = 5;
const BLANK_LINE = String.raw`\s|<div>(?:<br\s*/?>)?</div>|<br\s*/?>`;
const EDGE_BLANK_LINES = new RegExp(
  `^(?:${BLANK_LINE})+|(?:${BLANK_LINE})+$`,
  "gi",
);

// Neither Gmail nor Outlook lists a user's saved signatures through its API,
// so the ones they actually use are found in their recent sent mail.
export async function findSentSignatures({
  emailProvider,
  knownSignatures,
}: {
  emailProvider: EmailProvider;
  knownSignatures: string[];
}) {
  const messages = await emailProvider.getSentMessages(SENT_MESSAGES_TO_SCAN);
  const known = new Set(knownSignatures.map(getSignatureKey));
  const found = new Map<string, { html: string; count: number }>();

  for (const message of messages) {
    // The composer's spacer and footer sit inside the signature it sends.
    const html = stripBrandingSignatures(
      getOwnSignatureHtml(message.textHtml ?? ""),
    ).replace(EDGE_BLANK_LINES, "");
    const key = getSignatureKey(html);
    if (!key || known.has(key)) continue;

    const existing = found.get(key);
    if (existing) existing.count += 1;
    else found.set(key, { html, count: 1 });
  }

  return [...found.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_FOUND_SIGNATURES);
}

// The same signature sent twice can differ in markup but not in its text.
export function getSignatureKey(html: string) {
  return load(html).text().replace(/\s+/g, " ").trim().toLowerCase();
}
