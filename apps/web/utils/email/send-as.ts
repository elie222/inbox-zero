import { extractEmailAddress, splitRecipientList } from "@/utils/email";

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
