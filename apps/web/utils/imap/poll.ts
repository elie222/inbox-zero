import { withImapConnection } from "@/utils/imap/client";
import { getImapCredentials } from "@/utils/imap/credential";
import { searchImapMessages } from "@/utils/imap/message";
import type { Logger } from "@/utils/logger";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const defaultLogger = createScopedLogger("imap/poll");

interface PollResult {
  emailAccountId: string;
  error?: string;
  newMessages: number;
}

/**
 * Poll a single IMAP account for new messages.
 * Compares the current UIDNEXT with the stored lastSeenUid.
 */
export async function pollImapAccount(
  emailAccountId: string,
  logger?: Logger,
): Promise<PollResult> {
  const log = logger || defaultLogger;

  try {
    const credentials = await getImapCredentials(emailAccountId);

    const result = await withImapConnection(credentials, async (client) => {
      const mailbox = await client.mailboxOpen("INBOX", { readOnly: true });

      // Get the stored last seen UID
      const credential = await prisma.imapCredential.findFirst({
        where: {
          account: { emailAccount: { id: emailAccountId } },
        },
        select: { id: true, lastSeenUid: true },
      });

      if (!credential) {
        throw new Error("IMAP credential not found");
      }

      const lastSeenUid = credential.lastSeenUid || 0;
      const uidNext = (mailbox.uidNext as number) || 0;

      if (uidNext <= lastSeenUid) {
        // No new messages
        return { newMessages: 0 };
      }

      // Search for messages with UID > lastSeenUid
      const newUids = await searchImapMessages(client, {
        uid: `${lastSeenUid + 1}:*`,
      });

      if (newUids.length === 0) {
        return { newMessages: 0 };
      }

      log.info("Found new IMAP messages", {
        emailAccountId,
        count: newUids.length,
      });

      // Update lastSeenUid to the highest UID
      const highestUid = Math.max(...newUids);
      await prisma.imapCredential.update({
        where: { id: credential.id },
        data: {
          lastSeenUid: highestUid,
          lastPolledAt: new Date(),
        },
      });

      return { newMessages: newUids.length };
    });

    return {
      emailAccountId,
      ...result,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    log.error("Error polling IMAP account", {
      emailAccountId,
      error: errorMessage,
    });
    return {
      emailAccountId,
      newMessages: 0,
      error: errorMessage,
    };
  }
}

/**
 * Poll all active IMAP accounts.
 */
export async function pollAllImapAccounts(
  logger?: Logger,
): Promise<PollResult[]> {
  const log = logger || defaultLogger;

  const imapAccounts = await prisma.emailAccount.findMany({
    where: {
      account: {
        provider: "imap",
        disconnectedAt: null,
      },
    },
    select: { id: true },
  });

  log.info("Polling IMAP accounts", { count: imapAccounts.length });

  const results: PollResult[] = [];
  for (const account of imapAccounts) {
    const result = await pollImapAccount(account.id, log);
    results.push(result);
  }

  return results;
}
