import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";

export function getRequiresReconsentDescription(options?: {
  includeSupportText?: boolean;
}) {
  const description = `Please sign in again and approve every requested permission. If your Microsoft 365 organization requires admin approval, ask your admin to approve ${BRAND_NAME} first.`;

  if (!options?.includeSupportText) return description;

  return `${description} If this error persists please contact support at ${SUPPORT_EMAIL}`;
}

export function getEmailAlreadyLinkedDescription(options?: {
  includeSupportText?: boolean;
}) {
  const description = `This mailbox is already connected to another ${BRAND_NAME} account. To use it, sign in with the original account that owns this mailbox, then reconnect the mailbox from Accounts if needed. If you can't access that account or believe this is a duplicate, contact support so we can help recover or merge the accounts.`;

  if (!options?.includeSupportText) return description;

  return `${description} You can use the support chat or email us at ${SUPPORT_EMAIL}.`;
}
