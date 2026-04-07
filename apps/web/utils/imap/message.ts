import type { ImapFlow, FetchMessageObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMessage, ParsedMessageHeaders } from "@/utils/types";
import { buildThreadId } from "@/utils/imap/thread";

/**
 * Fetch a single message by UID from the currently selected mailbox.
 */
export async function fetchMessageByUid(
  client: ImapFlow,
  uid: number,
): Promise<ParsedMessage | null> {
  const msg = await client.fetchOne(String(uid), {
    uid: true,
    envelope: true,
    source: true,
    flags: true,
    labels: true,
  });

  if (!msg) return null;
  return convertImapMessage(msg);
}

/**
 * Fetch multiple messages by UIDs from the currently selected mailbox.
 */
export async function fetchMessagesByUids(
  client: ImapFlow,
  uids: number[],
): Promise<ParsedMessage[]> {
  if (uids.length === 0) return [];

  const messages: ParsedMessage[] = [];
  const uidRange = uids.join(",");

  for await (const msg of client.fetch(uidRange, {
    uid: true,
    envelope: true,
    source: true,
    flags: true,
    labels: true,
  })) {
    const parsed = await convertImapMessage(msg);
    if (parsed) messages.push(parsed);
  }

  return messages;
}

/**
 * Search messages in the currently selected mailbox.
 */
export async function searchImapMessages(
  client: ImapFlow,
  criteria: Record<string, unknown>,
  maxResults?: number,
): Promise<number[]> {
  const uids = await client.search(criteria, { uid: true });

  // UIDs are returned in ascending order; reverse for newest-first
  uids.reverse();

  if (maxResults && uids.length > maxResults) {
    return uids.slice(0, maxResults);
  }

  return uids;
}

/**
 * Convert an imapflow FetchMessageObject to our ParsedMessage format.
 */
export async function convertImapMessage(
  msg: FetchMessageObject,
): Promise<ParsedMessage | null> {
  try {
    const envelope = msg.envelope;
    if (!envelope) return null;

    let textHtml: string | undefined;
    let textPlain: string | undefined;

    // Parse the full source to extract body
    if (msg.source) {
      const parsed = await simpleParser(msg.source);
      textHtml = parsed.html || undefined;
      textPlain = parsed.text || undefined;
    }

    const fromAddr = envelope.from?.[0];
    const fromStr = fromAddr
      ? formatAddress(fromAddr.name, fromAddr.address)
      : "";

    const toAddrs = envelope.to || [];
    const toStr = toAddrs
      .map((a) => formatAddress(a.name, a.address))
      .join(", ");

    const ccAddrs = envelope.cc || [];
    const ccStr = ccAddrs
      .map((a) => formatAddress(a.name, a.address))
      .join(", ");

    const bccAddrs = envelope.bcc || [];
    const bccStr = bccAddrs
      .map((a) => formatAddress(a.name, a.address))
      .join(", ");

    const messageId = envelope.messageId || undefined;
    const inReplyTo = envelope.inReplyTo || undefined;
    // imapflow envelope doesn't include references directly;
    // if we parsed the source above, we could extract it
    let references: string | undefined;
    if (msg.source) {
      const parsed = await simpleParser(msg.source);
      if (parsed.references) {
        references = Array.isArray(parsed.references)
          ? parsed.references.join(" ")
          : parsed.references;
      }
    }

    const date = envelope.date
      ? new Date(envelope.date).toISOString()
      : new Date().toISOString();

    const threadId = buildThreadId(references, inReplyTo, messageId);

    const flags = msg.flags ? [...msg.flags] : [];
    const labelIds = flags;

    const headers: ParsedMessageHeaders = {
      from: fromStr,
      to: toStr,
      subject: envelope.subject || "(no subject)",
      date,
      ...(ccStr && { cc: ccStr }),
      ...(bccStr && { bcc: bccStr }),
      ...(messageId && { "message-id": messageId }),
      ...(inReplyTo && { "in-reply-to": inReplyTo }),
      ...(references && { references }),
    };

    const snippet = textPlain
      ? textPlain.slice(0, 200).replace(/\n/g, " ")
      : "";

    return {
      id: String(msg.uid),
      threadId,
      historyId: String(msg.uid),
      date,
      headers,
      subject: envelope.subject || "(no subject)",
      snippet,
      textHtml,
      textPlain,
      labelIds,
      inline: [],
      ...(inReplyTo && { internalDate: date }),
    };
  } catch {
    return null;
  }
}

function formatAddress(
  name: string | undefined,
  address: string | undefined,
): string {
  if (!address) return name || "";
  if (name) return `${name} <${address}>`;
  return address;
}

/**
 * Build an IMAP SEARCH criteria object from a simple query string.
 * Supports basic patterns like: from:x, to:x, subject:x, is:unread
 */
export function parseSearchQuery(query: string): Record<string, unknown> {
  const criteria: Record<string, unknown>[] = [];

  const parts = query.match(/(\w+:[^\s]+|"[^"]*"|\S+)/g) || [];

  for (const part of parts) {
    if (part.startsWith("from:")) {
      criteria.push({ from: part.slice(5) });
    } else if (part.startsWith("to:")) {
      criteria.push({ to: part.slice(3) });
    } else if (part.startsWith("subject:")) {
      criteria.push({ subject: part.slice(8) });
    } else if (part === "is:unread") {
      criteria.push({ unseen: true });
    } else if (part === "is:read") {
      criteria.push({ seen: true });
    } else if (part.startsWith("since:") || part.startsWith("after:")) {
      const dateStr = part.includes(":") ? part.split(":")[1] : "";
      criteria.push({ since: new Date(dateStr) });
    } else if (part.startsWith("before:")) {
      criteria.push({ before: new Date(part.slice(7)) });
    } else if (part === "has:attachment") {
      // Not directly supported by all IMAP servers
      criteria.push({ header: { "Content-Type": "multipart/mixed" } });
    } else {
      // Free text search - use BODY or TEXT
      criteria.push({ body: part });
    }
  }

  if (criteria.length === 0) return { all: true };
  if (criteria.length === 1) return criteria[0];
  return { and: criteria };
}
