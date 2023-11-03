import { ParsedMessage } from "@/utils/types";

export function fromName(email: string) {
  // converts "John Doe <john.doe@gmail>" to "John Doe"
  return email?.split("<")[0];
}

// Converts "Name <hey@domain.com>" to "domain.com"
export function parseDomain(email: string) {
  const domain = email.match(/@([\w.-]+\.[a-zA-Z]{2,6})/)?.[1];
  return domain;
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
