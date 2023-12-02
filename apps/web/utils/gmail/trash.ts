import { gmail_v1 } from "googleapis";

// trash moves the thread/message to the trash folder
// delete immediately deletes the thread/message
// trash does not require delete access from Gmail API

export async function trashThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
}) {
  const { gmail, threadId } = options;

  return gmail.users.threads.trash({
    userId: "me",
    id: threadId,
  });
}

export async function trashMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
}) {
  const { gmail, messageId } = options;

  return gmail.users.messages.trash({
    userId: "me",
    id: messageId,
  });
}
