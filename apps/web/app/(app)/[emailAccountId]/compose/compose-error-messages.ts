import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

// The compose helpers throw English errors, which stay in the console and
// logs. These translate the ones they raise themselves for toasts; errors that
// come from the server or the mail engine pass through unchanged.
const COMPOSE_ERROR_MESSAGES: Record<string, MessageDescriptor> = {
  "There was an error sending the email": msg`There was an error sending the email`,
  "Could not save this email on the device.": msg`Could not save this email on the device.`,
  "Could not queue this email. Try again.": msg`Could not queue this email. Try again.`,
  "This reply is already queued with different content. Check the thread delivery status.": msg`This reply is already queued with different content. Check the thread delivery status.`,
  "Mail is full of pending actions. Wait for some to finish, then try again.": msg`Mail is full of pending actions. Wait for some to finish, then try again.`,
  "This device does not have enough storage for that mail action.": msg`This device does not have enough storage for that mail action.`,
  "Could not load the draft's attachments.": msg`Could not load the draft's attachments.`,
  "Could not upload the attachment. Try again.": msg`Could not upload the attachment. Try again.`,
  "An attachment changed while it was being uploaded.": msg`An attachment changed while it was being uploaded.`,
  "Could not remove the attachment.": msg`Could not remove the attachment.`,
};

export function getComposeErrorMessage(
  error: unknown,
  i18n: I18n,
  fallback?: string,
) {
  let message: string;
  if (error instanceof Error) message = error.message;
  else if (typeof error === "string") message = error;
  else return fallback ?? "";
  const descriptor = COMPOSE_ERROR_MESSAGES[message];
  if (descriptor) return i18n._(descriptor);

  const attachFailed = message.match(/^Could not attach (.+)\.$/);
  if (attachFailed) {
    const filename = attachFailed[1].replace(/\. Try again$/, "");
    return filename === attachFailed[1]
      ? i18n._(msg`Could not attach ${filename}.`)
      : i18n._(msg`Could not attach ${filename}. Try again.`);
  }

  const unconfirmed = message.match(/^Could not confirm (.+) was attached\.$/);
  if (unconfirmed) {
    const filename = unconfirmed[1];
    return i18n._(msg`Could not confirm ${filename} was attached.`);
  }

  return message;
}
