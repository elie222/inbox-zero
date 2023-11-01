import { ParsedMessage } from "@/utils/types";

export function fromName(email: string) {
  // converts "John Doe <john.doe@gmail>" to "John Doe"
  return email?.split("<")[0];
}

export function parseFromEmail(email: string) {
  // converts "John Doe <john.doe@gmail.com>" to "john.doe@gmail.com"
  return email?.split("<")[1]?.split(">")[0];
}

export function participant(parsedMessage: ParsedMessage, userEmail: string) {
  // returns the other side of the conversation
  // if we're the sender, then return the recipient
  // if we're the recipient, then return the sender

  const sender: string = parsedMessage.headers.from;
  const recipient = parsedMessage.headers.to;

  if (sender.includes(userEmail)) return recipient;

  return sender;
}
