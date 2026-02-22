import { ActionType } from "@/generated/prisma/enums";

export function getMissingRecipientMessage({
  actionType,
  recipient,
  forwardMessage,
  sendEmailMessage,
}: {
  actionType: ActionType;
  recipient: string | null | undefined;
  forwardMessage: string;
  sendEmailMessage: string;
}): string | null {
  if (actionType !== ActionType.FORWARD && actionType !== ActionType.SEND_EMAIL)
    return null;
  if (recipient?.trim()) return null;

  return actionType === ActionType.SEND_EMAIL
    ? sendEmailMessage
    : forwardMessage;
}
