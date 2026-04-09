import type { ImapFlow, FetchMessageObject, MailboxObject } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMessage, ParsedMessageHeaders } from "@/utils/types";
import { buildThreadId } from "@/utils/imap/thread";

/**
 * Fetch a single message by sequence number with full body content.
 */
export async function fetchMessageBySeq(
  client: ImapFlow,
  seq: number,
): Promise<ParsedMessage | null> {
  const msg = await client.fetchOne(String(seq), {
    uid: true,
    envelope: true,
    flags: true,
  });

  if (!msg) return null;

  const body = await downloadMessageBody(client, seq);
  return convertImapMessage(msg, body);
}

/**
 * Fetch a single message by UID with full body content.
 * Uses SEARCH to find the sequence number first (WorkMail-compatible).
 */
export async function fetchMessageByUid(
  client: ImapFlow,
  uid: number,
): Promise<ParsedMessage | null> {
  try {
    // Find the sequence number for this UID
    const seqNums = await client.search({ uid: `${uid}` }, { uid: false });
    if (seqNums.length === 0) return null;

    const seq = seqNums[0];
    const msg = await client.fetchOne(String(seq), {
      uid: true,
      envelope: true,
      flags: true,
    });
    if (!msg) return null;

    const body = await downloadMessageBody(client, seq);
    return convertImapMessage(msg, body);
  } catch {
    return null;
  }
}

/**
 * Fetch the most recent N messages from the currently selected mailbox.
 * Uses sequence numbers (most reliable across IMAP servers).
 */
export async function fetchRecentMessages(
  client: ImapFlow,
  mailbox: MailboxObject,
  maxResults: number,
): Promise<ParsedMessage[]> {
  const total = mailbox.exists || 0;
  if (total === 0) return [];

  const start = Math.max(1, total - maxResults + 1);
  const range = `${start}:*`;

  const messages: ParsedMessage[] = [];
  for await (const msg of client.fetch(range, {
    uid: true,
    envelope: true,
    flags: true,
  })) {
    const parsed = await convertImapMessage(msg);
    if (parsed) messages.push(parsed);
  }

  // Return newest first
  messages.reverse();
  return messages;
}

/**
 * Fetch multiple messages by UIDs - envelope only (no body).
 * Uses UID-based SEARCH to find each message's sequence number,
 * then fetches by sequence range (WorkMail-compatible).
 */
export async function fetchMessagesByUids(
  client: ImapFlow,
  uids: number[],
): Promise<ParsedMessage[]> {
  if (uids.length === 0) return [];

  // Find the sequence numbers for these UIDs via SEARCH
  // Then fetch by sequence range which works on all servers
  const messages: ParsedMessage[] = [];

  for (const uid of uids) {
    try {
      // SEARCH UID <uid> returns matching sequence numbers
      const seqNums = await client.search({ uid: `${uid}` }, { uid: false });
      if (seqNums.length === 0) continue;

      const seq = seqNums[0];
      const msg = await client.fetchOne(String(seq), {
        uid: true,
        envelope: true,
        flags: true,
      });
      if (msg) {
        const parsed = await convertImapMessage(msg);
        if (parsed) messages.push(parsed);
      }
    } catch {
      // Skip messages that fail to fetch
    }
  }

  return messages;
}

/**
 * Download the full body of a message by sequence number.
 */
async function downloadMessageBody(
  client: ImapFlow,
  seq: number,
): Promise<{ textHtml?: string; textPlain?: string; references?: string }> {
  try {
    const downloaded = await client.download(String(seq));
    const chunks: Buffer[] = [];
    for await (const chunk of downloaded.content) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    const parsed = await simpleParser(raw);

    let references: string | undefined;
    if (parsed.references) {
      references = Array.isArray(parsed.references)
        ? parsed.references.join(" ")
        : parsed.references;
    }

    return {
      textHtml: parsed.html || undefined,
      textPlain: parsed.text || undefined,
      references,
    };
  } catch {
    return {};
  }
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
  body?: { textHtml?: string; textPlain?: string; references?: string },
): Promise<ParsedMessage | null> {
  try {
    const envelope = msg.envelope;
    if (!envelope) return null;

    const textHtml = body?.textHtml;
    const textPlain = body?.textPlain;
    const references = body?.references;

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
      : envelope.subject || "";

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
      criteria.push({ header: { "Content-Type": "multipart/mixed" } });
    } else {
      criteria.push({ body: part });
    }
  }

  if (criteria.length === 0) return { all: true };
  if (criteria.length === 1) return criteria[0];
  return { and: criteria };
}
