import { getEmailUrlForMessage } from "@/utils/url";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

type GetEmailMessageCellActionsOptions = {
  externalUrl?: string;
  hideViewEmailButton?: boolean;
  messageId: string;
  provider?: string;
  threadId: string;
  userEmail?: string | null;
};

export function getEmailMessageCellActions({
  externalUrl,
  hideViewEmailButton,
  messageId,
  provider,
  threadId,
  userEmail,
}: GetEmailMessageCellActionsOptions) {
  if (hideViewEmailButton) return null;

  const openUrl =
    externalUrl ||
    (isMicrosoftProvider(provider)
      ? undefined
      : getEmailUrlForMessage(messageId, threadId, userEmail, provider));

  return {
    openUrl,
    showViewEmailButton: true,
  };
}
