import type { ImapFlow } from "imapflow";
import { findDraftsFolder } from "@/utils/imap/folder";

/**
 * Save a draft message to the IMAP Drafts folder.
 * Returns the UID of the appended message.
 */
export async function saveDraft(
  client: ImapFlow,
  options: {
    from: string;
    to: string;
    subject: string;
    html?: string;
    text?: string;
    inReplyTo?: string;
    references?: string;
  },
): Promise<string> {
  const draftsFolder = await findDraftsFolder(client);

  const messageParts: string[] = [
    `From: ${options.from}`,
    `To: ${options.to}`,
    `Subject: ${options.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
  ];

  if (options.inReplyTo) {
    messageParts.push(`In-Reply-To: ${options.inReplyTo}`);
  }
  if (options.references) {
    messageParts.push(`References: ${options.references}`);
  }

  if (options.html) {
    messageParts.push("Content-Type: text/html; charset=utf-8");
    messageParts.push("");
    messageParts.push(options.html);
  } else {
    messageParts.push("Content-Type: text/plain; charset=utf-8");
    messageParts.push("");
    messageParts.push(options.text || "");
  }

  const rawMessage = messageParts.join("\r\n");

  const result = await client.append(
    draftsFolder,
    Buffer.from(rawMessage),
    ["\\Draft"],
    new Date(),
  );

  return result.uid
    ? String(result.uid)
    : result.uidValidity
      ? String(result.uidValidity)
      : "unknown";
}
