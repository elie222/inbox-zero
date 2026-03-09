import { z } from "zod";
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

export function addMissingRecipientIssue({
  actionType,
  recipient,
  ctx,
  path,
  forwardMessage,
  sendEmailMessage,
}: {
  actionType: ActionType;
  recipient: string | null | undefined;
  ctx: z.RefinementCtx;
  path: (string | number)[];
  forwardMessage: string;
  sendEmailMessage: string;
}) {
  const message = getMissingRecipientMessage({
    actionType,
    recipient,
    forwardMessage,
    sendEmailMessage,
  });
  if (!message) return;

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
}
