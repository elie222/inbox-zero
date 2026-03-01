import {
  getMessagingPlatformName,
  type MessagingPlatform,
} from "@/utils/messaging/platforms";

export const PENDING_DRAFT_CONFIRMATION_MESSAGE =
  "This draft is pending confirmation in Inbox Zero.";

export function getMessagingDraftConfirmationAction(
  platform?: MessagingPlatform,
): string {
  const platformName = platform
    ? getMessagingPlatformName(platform)
    : "messaging chat";

  return `open Inbox Zero in the web app and confirm the draft (there is no in-chat approval button in ${platformName} yet)`;
}
