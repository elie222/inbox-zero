import {
  canonicalizeEmailAddress,
  extractNameFromEmail,
  splitRecipientList,
} from "@/utils/email";
import type { ParsedMessageHeaders } from "@/utils/types";

type ParticipantMessage = {
  headers: Pick<ParsedMessageHeaders, "from" | "to">;
};

export function getThreadParticipantNames(
  messages: ParticipantMessage[],
  userEmail: string,
) {
  const normalizedUserEmail = canonicalizeEmailAddress(userEmail);
  const senders = new Map<string, string>();

  for (const message of messages) {
    addParticipant(senders, message.headers.from, normalizedUserEmail);
  }

  const isOutgoingOnly = senders.size === 1 && senders.has(normalizedUserEmail);
  if (!isOutgoingOnly) return [...senders.values()];

  const recipients = new Map<string, string>();
  for (const message of messages) {
    for (const recipient of splitRecipientList(message.headers.to)) {
      addParticipant(recipients, recipient, normalizedUserEmail);
    }
  }
  // An outgoing-only thread should name the other side, not "me".
  recipients.delete(normalizedUserEmail);

  return recipients.size ? [...recipients.values()] : [...senders.values()];
}

function addParticipant(
  participants: Map<string, string>,
  header: string,
  normalizedUserEmail: string,
) {
  const email = canonicalizeEmailAddress(header);
  const key = email || header.trim().toLowerCase();
  if (!key || participants.has(key)) return;

  const name =
    email && email === normalizedUserEmail
      ? "me"
      : extractNameFromEmail(header) || email;
  if (name) participants.set(key, name);
}
