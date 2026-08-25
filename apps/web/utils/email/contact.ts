import { isValidEmail } from "@/utils/email";

export type EmailContact = {
  emailAddress: string;
  name?: string;
  profilePictureUrl?: string;
};

export function normalizeContactCandidates(
  candidates: EmailContact[],
  maxResults = 10,
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
