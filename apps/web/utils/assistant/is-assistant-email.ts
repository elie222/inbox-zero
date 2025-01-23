import { extractEmailAddress } from "@/utils/email";

const ASSISTANT_SUFFIX = "assistant";

export function isAssistantEmail({
  userEmail,
  recipientEmail,
}: {
  userEmail: string;
  recipientEmail: string;
}): boolean {
  const [localPart, domain] = userEmail.split("@");
  const extractedRecipientEmail = extractEmailAddress(recipientEmail);
  const pattern = new RegExp(
    `^${localPart}\\+${ASSISTANT_SUFFIX}\\d*@${domain}$`,
  );
  return pattern.test(extractedRecipientEmail);
}
