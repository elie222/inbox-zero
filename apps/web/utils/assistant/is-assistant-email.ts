import { env } from "@/env";
import { extractEmailAddress, formatEmailWithName } from "@/utils/email";

// In prod: hello+assistant@example.com
// In dev: hello+assistant-test@example.com
const ASSISTANT_SUFFIX = `assistant${
  env.NODE_ENV === "development" ? "-test" : ""
}`;
const ASSISTANT_DISPLAY_NAME = "Inbox Zero Assistant";

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

export function getAssistantReplyTo({
  userEmail,
}: {
  userEmail: string;
}): string {
  return formatEmailWithName(
    ASSISTANT_DISPLAY_NAME,
    getAssistantEmail({ userEmail }),
  );
}
