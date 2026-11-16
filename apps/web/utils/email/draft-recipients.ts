import { isValidEmail, splitRecipientList } from "@/utils/email";

export function completeDraftRecipients(value: string): string {
  return splitRecipientList(value).filter(isCompleteRecipient).join(", ");
}

function isCompleteRecipient(recipient: string): boolean {
  // Avoid substring extraction: unfinished input must never become a MIME address.
  // Bound email validation independently of the user-controlled display name.
  if (/[\r\n]/.test(recipient)) return false;
  if (recipient.length <= 254 && isValidEmail(recipient)) return true;

  const mailbox = /^([^<>]*)<([^<>]+)>$/.exec(recipient);
  if (!mailbox) return false;
  const address = mailbox[2].trim();
  if (address.length > 254 || !isValidEmail(address)) return false;

  const name = mailbox[1].trim();
  if (name.startsWith('"')) return /^"(?:[^"\\\r\n]|\\[^\r\n])*"$/.test(name);
  return !/[()<>[\]:;@\\,"\r\n]/.test(name);
}
