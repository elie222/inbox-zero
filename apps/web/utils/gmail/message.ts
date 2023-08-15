import { MessageWithPayload } from "@/utils/types";
import { gmail_v1 } from "googleapis";

export async function getMessage(
  messageId: string,
  gmail: gmail_v1.Gmail
): Promise<MessageWithPayload> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  return message.data as MessageWithPayload;
}
