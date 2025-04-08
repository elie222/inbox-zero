import type { ParsedMessage } from "@/utils/types";

// Converts "John Doe <john.doe@gmail>" to "John Doe"
// Converts "<john.doe@gmail>" to "john.doe@gmail"
// Converts "john.doe@gmail" to "john.doe@gmail"
export function extractNameFromEmail(email: string) {
  if (!email) return "";
  const firstPart = email.split("<")[0]?.trim();
  if (firstPart) return firstPart;
  const secondPart = email.split("<")?.[1]?.trim();
  if (secondPart) return secondPart.split(">")[0];
  return email;
}

// Converts "John Doe <john.doe@gmail>" to "john.doe@gmail"
export function extractEmailAddress(email: string): string {
  if (!email) return "";

  // Standard email pattern that matches common email formats
  // Allows:
  // - Letters, numbers, dots, and plus signs in local part
  // - Standard domain formats
  // - Case insensitive
  // - Emails anywhere within text
  const emailPattern = /[a-zA-Z0-9.+]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;

  // Try last bracketed content first
  const match = email.match(/<([^<>]+)>$/);
  if (match && emailPattern.test(match[1].trim())) {
    return match[1].trim();
  }

  // Fall back to finding any email in the string
  const rawMatch = email.match(emailPattern);
  return rawMatch ? rawMatch[0] : "";
}

// Normalizes email addresses by:
// - Converting to lowercase
// - Removing all dots from local part
// - Removing all whitespace from local part
// - Preserving domain part unchanged
// Example: "John.Doe.Smith@gmail.com" -> "johndoesmith@gmail.com"
export function normalizeEmailAddress(email: string) {
  const [localPart, domain] = email.toLowerCase().split("@");
  if (!domain) return email.toLowerCase();
  // Remove all dots and whitespace from local part
  const normalizedLocal = localPart.trim().replace(/[\s.]+/g, "");
  return `${normalizedLocal}@${domain}`;
}

// Converts "Name <hey@domain.com>" to "domain.com"
export function extractDomainFromEmail(email: string) {
  if (!email) return "";

  // Extract clean email address from formatted strings like "Name <email@domain.com>"
  const emailAddress = email.includes("<") ? extractEmailAddress(email) : email;

  // Validate email has exactly one @ symbol
  if ((emailAddress.match(/@/g) || []).length !== 1) return "";

  // Extract domain using regex that supports:
  // - International characters (via \p{L})
  // - Multiple subdomains (e.g. sub1.sub2.domain.com)
  // - Common domain characters (letters, numbers, dots, hyphens)
  // - TLDs of 2 or more characters
  const domain = emailAddress.match(
    /@([\p{L}a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/u,
  )?.[1];
  return domain || "";
}

// returns the other side of the conversation
// if we're the sender, then return the recipient
// if we're the recipient, then return the sender
export function participant(
  message: { headers: Pick<ParsedMessage["headers"], "from" | "to"> },
  userEmail: string,
) {
  if (!userEmail) return message.headers.from;
  if (message.headers.from.includes(userEmail)) return message.headers.to;
  return message.headers.from;
}
