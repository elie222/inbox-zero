import {
  getMessagingPlatformName,
  type MessagingPlatform,
} from "@/utils/messaging/platforms";

export const PENDING_DRAFT_CONFIRMATION_MESSAGE =
  "This draft is pending confirmation.";

export function getMessagingDraftConfirmationAction(
  platform?: MessagingPlatform,
): string {
  if (!platform) return "click the Send button in this thread";
  return `click the Send button in this ${getMessagingPlatformName(platform)} thread`;
}
