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

/**
 * The signature compose starts with. Mail sent through the API gets no
 * signature from the provider, so the default address falls back to the
 * provider's signature when none is set in the app.
 */
export function getSendAsSignatureHtml(
  address: SendAsAddress | undefined,
  addresses: SendAsAddress[],
  accountSignatureHtml: string,
) {
  const sendAs = address ?? addresses.find((item) => item.isDefault);
  if (sendAs?.isDefault) return accountSignatureHtml || sendAs.signature || "";
  return sendAs?.signature || accountSignatureHtml;
}

export function formatSendAsAddress({ email, name }: SendAsAddress) {
  if (!name || name === email) return email;
  return `"${name.replace(/["\\]/g, "\\$&")}" <${email}>`;
}
