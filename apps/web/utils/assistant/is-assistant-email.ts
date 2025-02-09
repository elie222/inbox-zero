import { env } from "@/env";
import { extractEmailAddress } from "@/utils/email";

// In prod: hello+assistant@example.com
// In dev: hello+assistant-test@example.com
const ASSISTANT_SUFFIX = `assistant${
  env.NODE_ENV === "development" ? "-test" : ""
}`;

export function isAssistantEmail({
  userEmail,
  emailToCheck,
}: {
  userEmail: string;
  emailToCheck: string;
}): boolean {
  if (!emailToCheck) return false;

  const [localPart, domain] = userEmail.split("@");
  const extractedEmailToCheck = extractEmailAddress(emailToCheck);
  const pattern = new RegExp(
    `^${localPart}\\+${ASSISTANT_SUFFIX}\\d*@${domain}$`,
  );
  return pattern.test(extractedEmailToCheck);
}

// ignores the +1, +2, etc. suffixes, but good enough for our purposes
export function getAssistantEmail({
  userEmail,
}: {
  userEmail: string;
}): string {
  const [localPart, domain] = userEmail.split("@");
  return `${localPart}+${ASSISTANT_SUFFIX}@${domain}`;
}
