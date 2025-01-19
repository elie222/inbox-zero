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
  const assistantEmail = `${localPart}+${ASSISTANT_SUFFIX}@${domain}`;
  const extractedRecipientEmail = extractEmailAddress(recipientEmail);
  return assistantEmail === extractedRecipientEmail;
}
