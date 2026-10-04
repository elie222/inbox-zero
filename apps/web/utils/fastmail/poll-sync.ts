import {
  applyFastmailFilters,
  isManagedFastmailFilter,
} from "@/utils/fastmail/filters";
import { randomUUID } from "node:crypto";
import prisma from "@/utils/prisma";
import {
  hasAiAccess,
  getUserTier,
  premiumEntitlementSelect,
} from "@/utils/premium";
import { createEmailProvider } from "@/utils/email/provider";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import type { FastmailProvider } from "@/utils/email/fastmail";
import type { Logger } from "@/utils/logger";
import { enqueueFastmailSync } from "@/utils/fastmail/queue";
import { InvalidMailboxSyncCursorError } from "@/utils/email/mailbox-sync";

export interface PollSyncResult {
  email: string;
  emailAccountId: string;
  error?: string;
  newState?: string;
  processedCount?: number;
  status: "success" | "error" | "skipped" | "no_changes";
}

export async function pollAllFastmailAccounts(
  logger: Logger,
): Promise<PollSyncResult[]> {
  const accounts = await prisma.emailAccount.findMany({
    where: { account: { provider: "fastmail", access_token: { not: null } } },
    select: { id: true, email: true },
  });
  const results: PollSyncResult[] = [];
  for (const account of accounts) {
    try {
      await enqueueFastmailSync(account.id);
      results.push({
        emailAccountId: account.id,
        email: account.email,
        status: "success",
      });
    } catch (error) {
      logger.error("Could not enqueue Fastmail recovery", {
        emailAccountId: account.id,
        error,
      });
      throw error;
    }
  }
  return results;
}

export async function pollFastmailAccount({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
  forceSync?: boolean;
}): Promise<PollSyncResult> {
  const owner = randomUUID();
  const log = logger.with({ emailAccountId });
  const started = Date.now();
  const claimed = await prisma.emailAccount.updateMany({
    where: {
      id: emailAccountId,
      account: { provider: "fastmail" },
      OR: [
        { fastmailLeaseUntil: null },
        { fastmailLeaseUntil: { lt: new Date() } },
      ],
    },
    data: {
      fastmailLeaseOwner: owner,
      fastmailLeaseUntil: new Date(Date.now() + 600_000),
    },
  });
  if (!claimed.count) return { emailAccountId, email: "", status: "skipped" };
  let processedCount = 0;
  try {
    const account = await prisma.emailAccount.findUniqueOrThrow({
      where: { id: emailAccountId },
      select: accountSelect,
    });
    const provider = (await createEmailProvider({
      emailAccountId,
      provider: "fastmail",
      logger: log,
    })) as FastmailProvider;
    let cursor = account.lastSyncedHistoryId;
    let resyncState = account.fastmailResyncState;
    let resyncPosition = account.fastmailResyncPosition;
    const baselineDate =
      account.fastmailSyncStartedAt ?? account.lastPolledAt ?? new Date();
    if (!account.fastmailSyncStartedAt) {
      // Preserve the recovery window of accounts connected before this migration.
      await prisma.emailAccount.update({
        where: { id: emailAccountId, fastmailLeaseOwner: owner },
        data: { fastmailSyncStartedAt: baselineDate },
      });
    }
    let more = true;
    while (more && Date.now() - started < 120_000) {
      if (resyncState) {
        let page: Awaited<
          ReturnType<FastmailProvider["getMessagesWithPagination"]>
        >;
        try {
          page = await provider.getMessagesWithPagination({
            after: baselineDate,
            maxResults: 100,
            pageToken: resyncPosition ?? undefined,
          });
        } catch (error) {
          if (!(error instanceof InvalidMailboxSyncCursorError)) throw error;
          // The last scanned message was deleted; restart safely using intake deduplication.
          resyncPosition = null;
          await prisma.emailAccount.update({
            where: { id: emailAccountId, fastmailLeaseOwner: owner },
            data: { fastmailResyncPosition: null },
          });
          continue;
        }
        await prisma.$transaction([
          prisma.fastmailSyncItem.createMany({
            data: page.messages.map((message) => ({
              emailAccountId,
              messageId: message.id,
            })),
            skipDuplicates: true,
          }),
          prisma.emailAccount.update({
            where: { id: emailAccountId, fastmailLeaseOwner: owner },
            data: {
              fastmailResyncPosition: page.nextPageToken ?? null,
              fastmailResyncState: page.nextPageToken ? resyncState : null,
              ...(page.nextPageToken
                ? {}
                : { lastSyncedHistoryId: resyncState }),
            },
          }),
        ]);
        resyncPosition = page.nextPageToken ?? null;
        if (!page.nextPageToken) {
          cursor = resyncState;
          resyncState = null;
        }
        continue;
      }
      let changes: Awaited<ReturnType<FastmailProvider["getEmailChanges"]>>;
      try {
        changes = await provider.getEmailChanges(cursor);
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/JMAP error: (cannotCalculateChanges|invalidState)/.test(
            error.message,
          )
        )
          throw error;
        resyncState = (await provider.getEmailChanges(null)).newState;
        resyncPosition = null;
        await prisma.emailAccount.update({
          where: { id: emailAccountId, fastmailLeaseOwner: owner },
          data: {
            fastmailResyncState: resyncState,
            fastmailResyncPosition: null,
          },
        });
        continue;
      }
      await prisma.$transaction([
        prisma.fastmailSyncItem.createMany({
          data: changes.created.map((messageId) => ({
            emailAccountId,
            messageId,
          })),
          skipDuplicates: true,
        }),
        prisma.emailAccount.update({
          where: { id: emailAccountId, fastmailLeaseOwner: owner },
          data: { lastSyncedHistoryId: changes.newState },
        }),
      ]);
      cursor = changes.newState;
      more = changes.hasMoreChanges;
    }
    const pending = await prisma.fastmailSyncItem.findMany({
      where: { emailAccountId, processedAt: null },
      orderBy: [{ attempts: "asc" }, { createdAt: "asc" }],
      take: 100,
    });
    let failed = false;
    for (const item of pending) {
      if (Date.now() - started > 230_000) {
        more = true;
        break;
      }
      const owned = await prisma.emailAccount.updateMany({
        where: { id: emailAccountId, fastmailLeaseOwner: owner },
        data: { fastmailLeaseUntil: new Date(Date.now() + 600_000) },
      });
      if (!owned.count) throw new Error("Fastmail sync lease was lost");
      try {
        const message = (await provider.getMessagesBatch([item.messageId]))[0];
        if (message)
          await applyFastmailFilters(message, account.rules, provider);
        if (message)
          await processHistoryItem(
            { messageId: item.messageId, message },
            {
              provider,
              emailAccount: { ...account, userId: account.user.id },
              rules: account.rules.filter(
                (rule) => !isManagedFastmailFilter(rule),
              ),
              hasAutomationRules: account.rules.length > 0,
              hasAiAccess: hasAiAccess(
                getUserTier(account.user.premium),
                !!account.user.aiApiKey,
              ),
              propagateProcessingErrors: true,
              logger: log.with({ messageId: item.messageId }),
            },
          );
        await prisma.fastmailSyncItem.update({
          where: {
            emailAccountId_messageId: {
              emailAccountId,
              messageId: item.messageId,
            },
          },
          data: { processedAt: new Date(), lastError: null },
        });
        processedCount++;
      } catch (error) {
        failed = true;
        log.error("Fastmail message remains pending", {
          messageId: item.messageId,
          error,
        });
        await prisma.fastmailSyncItem.update({
          where: {
            emailAccountId_messageId: {
              emailAccountId,
              messageId: item.messageId,
            },
          },
          data: {
            attempts: { increment: 1 },
            lastError: "Message processing failed; see server logs.",
          },
        });
      }
    }
    if (failed)
      throw new Error("Some Fastmail messages remain pending for retry");
    await prisma.emailAccount.update({
      where: { id: emailAccountId, fastmailLeaseOwner: owner },
      data: { lastPolledAt: new Date() },
    });
    // Release before scheduling the next page so a fast worker can claim it.
    await prisma.emailAccount.updateMany({
      where: { id: emailAccountId, fastmailLeaseOwner: owner },
      data: { fastmailLeaseOwner: null, fastmailLeaseUntil: null },
    });
    if (more || pending.length === 100)
      await enqueueFastmailSync(emailAccountId);
    return {
      emailAccountId,
      email: account.email,
      status: processedCount ? "success" : "no_changes",
      processedCount,
      newState: cursor ?? undefined,
    };
  } catch (error) {
    log.error("Fastmail synchronization failed", { error });
    return {
      emailAccountId,
      email: "",
      status: "error",
      processedCount,
      error:
        error instanceof Error
          ? error.message
          : "Fastmail synchronization failed",
    };
  } finally {
    await prisma.emailAccount.updateMany({
      where: { id: emailAccountId, fastmailLeaseOwner: owner },
      data: { fastmailLeaseOwner: null, fastmailLeaseUntil: null },
    });
  }
}
const accountSelect = {
  id: true,
  email: true,
  lastSyncedHistoryId: true,
  lastPolledAt: true,
  fastmailSyncStartedAt: true,
  fastmailResyncState: true,
  fastmailResyncPosition: true,
  autoCategorizeSenders: true,
  about: true,
  multiRuleSelectionEnabled: true,
  timezone: true,
  calendarBookingLink: true,
  sensitiveDataPolicy: true,
  draftReplyConfidence: true,
  filingEnabled: true,
  filingPrompt: true,
  filingConfirmationSendEmail: true,
  account: {
    select: {
      provider: true,
      access_token: true,
      refresh_token: true,
      expires_at: true,
    },
  },
  rules: {
    where: { enabled: true },
    include: { actions: true },
  },
  user: {
    select: {
      id: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      premium: {
        select: {
          ...premiumEntitlementSelect,
        },
      },
    },
  },
} as const;
