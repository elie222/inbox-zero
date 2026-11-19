import { extractEmailAddress, splitRecipientList } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";

export type SendAsAddress = {
  email: string;
  name?: string;
  isDefault: boolean;
  /** The provider's signature for this address, as HTML. */
  signature?: string;
};

/**
 * The address a reply goes out from: the first of the user's own addresses
 * found among `candidates`, the way Gmail answers mail sent to an alias from
 * that alias. Falls back to the default address.
 */
export function findReplySendAsAddress(
  candidates: string | undefined,
  addresses: SendAsAddress[],
): SendAsAddress | undefined {
  const byEmail = new Map(
    addresses.map((address) => [address.email.toLowerCase(), address]),
  );
  for (const candidate of splitRecipientList(candidates ?? "")) {
    const match = byEmail.get(extractEmailAddress(candidate).toLowerCase());
    if (match) return match;
  }
  return addresses.find((address) => address.isDefault);
}

export function formatSendAsAddress({ email, name }: SendAsAddress) {
  if (!name || name === email) return email;
  return `"${name.replace(/["\\]/g, "\\$&")}" <${email}>`;
}

// The user's other addresses, so mail from or to an alias is treated as the
// user's own. Outlook can't list aliases, so this is empty there.
export async function getSendAsEmails({
  provider,
  userEmail,
  logger,
}: {
  provider: EmailProvider;
  userEmail: string;
  logger: Logger;
}): Promise<string[]> {
  try {
    const addresses = await provider.getSendAsAddresses();
    return [
      ...new Set(addresses.map((address) => address.email.toLowerCase())),
    ].filter((email) => email !== userEmail.toLowerCase());
  } catch (error) {
    logger.warn("Failed to load send-as addresses", { error });
    return [];
  }
}

// Mail the user sent from an alias through another client arrives without the
// provider's sent marker, so the From address is checked too.
export function isSentByUser({
  message,
  userEmails,
  provider,
}: {
  message: ParsedMessage;
  userEmails: string[];
  provider: Pick<EmailProvider, "isSentMessage">;
}): boolean {
  if (provider.isSentMessage(message)) return true;
  const from = extractEmailAddress(message.headers.from).toLowerCase();
  return userEmails.some((email) => email.toLowerCase() === from);
}
