import { getEmailUrlForMessage } from "@/utils/url";

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

  return {
    openUrl:
      externalUrl ||
      getEmailUrlForMessage(messageId, threadId, userEmail, provider),
  };
}
