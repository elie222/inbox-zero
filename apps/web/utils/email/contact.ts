import { isValidEmail } from "@/utils/email";

export type EmailContact = {
  emailAddress: string;
  name?: string;
  profilePictureUrl?: string;
};

export const MAX_CONTACT_RESULTS = 10;

export function normalizeContactCandidates(
  candidates: EmailContact[],
  maxResults = MAX_CONTACT_RESULTS,
) {
  if (maxResults <= 0) return [];

  const contacts: EmailContact[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    const emailAddress = candidate.emailAddress.trim();
    const key = emailAddress.toLowerCase();
    if (!isValidEmail(emailAddress) || seen.has(key)) continue;

    seen.add(key);
    contacts.push({ ...candidate, emailAddress });
    if (contacts.length === maxResults) break;
  }

  return contacts;
}

// Both providers already decide "this contact source denied us" from a wider
// set of shapes than any single predicate covers. They raise this so callers
// can offer a reconnect without re-deriving that decision per provider.
export class ContactsAccessDeniedError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Contact access was denied by the email provider", options);
    this.name = "ContactsAccessDeniedError";
  }
}
