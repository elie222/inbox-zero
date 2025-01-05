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
  const match = email.match(/<(.*)>/);
  return match ? match[1] : "";
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
