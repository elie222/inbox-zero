import { gmail_v1 } from "googleapis";
import { parseMessage } from "@/utils/mail";
import { MessageWithPayload } from "@/utils/types";
import { getBatch } from "@/utils/gmail/batch";

export async function getMessage(
  messageId: string,
  gmail: gmail_v1.Gmail,
  format?: "full",
): Promise<MessageWithPayload> {
  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format,
  });

  return message.data as MessageWithPayload;
}

export async function getMessagesBatch(
  messageIds: string[],
  accessToken: string,
) {
  const batch: MessageWithPayload[] = await getBatch(
    messageIds,
    "/gmail/v1/users/me/messages",
    accessToken,
  );

  const messages = batch.map((message) => {
    return {
      ...message,
      parsedMessage: parseMessage(message),
    };
  });

  return messages;
}

async function findPreviousEmailsBySender(
  gmail: gmail_v1.Gmail,
  options: {
    sender: string;
    dateInSeconds: number;
  },
) {
  const messages = await gmail.users.messages.list({
    userId: "me",
    q: `from:${options.sender} before:${options.dateInSeconds}`,
    maxResults: 2,
  });

  return messages.data.messages;
}

export async function hasPreviousEmailsFromSender(
  gmail: gmail_v1.Gmail,
  options: { from: string; date: string; threadId: string },
) {
  const previousEmails = await findPreviousEmailsBySender(gmail, {
    sender: options.from,
    dateInSeconds: +new Date(options.date) / 1000,
  });
  const hasPreviousEmail = !!previousEmails?.find(
    (p) => p.threadId !== options.threadId,
  );

  return hasPreviousEmail;
}
