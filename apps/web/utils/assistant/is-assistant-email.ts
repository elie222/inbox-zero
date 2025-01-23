import { extractEmailAddress } from "@/utils/email";

const ASSISTANT_SUFFIX = "assistant";

export function isAssistantEmail({
  userEmail,
  emailToCheck,
}: {
  userEmail: string;
  emailToCheck: string;
}): boolean {
  const [localPart, domain] = userEmail.split("@");
  const extractedEmailToCheck = extractEmailAddress(emailToCheck);
  const pattern = new RegExp(
    `^${localPart}\\+${ASSISTANT_SUFFIX}\\d*@${domain}$`,
  );
  return pattern.test(extractedEmailToCheck);
}
