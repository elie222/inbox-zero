import "server-only";

import { Prisma } from "@/generated/prisma/client";
import {
  deleteEmailMessageStats,
  reconcileEmailMessageStatsFromParsedMessage,
  shouldExcludeFromEmailMessageStats,
} from "@/utils/email/email-message-stats";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { isGmailMessageNotFoundError } from "@/utils/gmail/errors";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const DEFAULT_ACCOUNT_LIMIT = 10;
const DEFAULT_BATCH_SIZE = 25;
const DEFAULT_SAMPLE_LIMIT = 20;
const DEFAULT_MAX_ERRORS_PER_ACCOUNT = 5;
const DEFAULT_SOFT_TIME_LIMIT_MS = 270_000;
const GOOGLE_PROVIDER = "google";

type EmailMessageStatsReconciliationOptions = {
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
  dryRun?: boolean;
  batchSize?: number;
  sampleLimit?: number;
  maxErrorsPerAccount?: number;
  softTimeLimitMs?: number;
  deadlineAt?: number;
};

type ConfiguredAccountsReconciliationOptions = {
  logger: Logger;
  emailAccountId?: string;
  dryRun?: boolean;
  accountLimit?: number;
  batchSize?: number;
  sampleLimit?: number;
  maxErrorsPerAccount?: number;
  softTimeLimitMs?: number;
};

type ReconciliationAction =
  | "would-delete-not-found"
  | "deleted-not-found"
  | "would-delete-excluded-label"
  | "deleted-excluded-label"
  | "would-upsert"
  | "upserted"
  | "would-replace-thread-id"
  | "replaced-thread-id"
  | "error";

type ReconciliationSample = {
  messageId: string;
  threadId: string;
  action: ReconciliationAction;
  labels?: string[];
  error?: string;
};

type AccountReconciliationResult = {
  emailAccountId: string;
  dryRun: boolean;
  scanned: number;
  checked: number;
  upserted: number;
  wouldUpsert: number;
  deleted: number;
  wouldDelete: number;
  deletedNotFound: number;
  deletedExcludedLabel: number;
  threadIdChanged: number;
  errors: number;
  stoppedEarly?: "max-errors" | "time-limit";
  hasMore: boolean;
  samples: ReconciliationSample[];
};

type ConfiguredAccountsReconciliationResult = {
  dryRun: boolean;
  accountsChecked: number;
  accountsSkipped: number;
  failedAccounts: number;
  stoppedEarly?: "time-limit";
  totals: Omit<
    AccountReconciliationResult,
    "emailAccountId" | "dryRun" | "stoppedEarly" | "hasMore" | "samples"
  >;
  accounts: AccountReconciliationResult[];
};

type EmailMessageStatsCandidate = {
  id: string;
  messageId: string;
  threadId: string;
};

type AccountCandidate = {
  id: string;
  provider: string;
  localEmailMessageCount: number | bigint;
};

export async function reconcileEmailMessageStatsForAccount({
  emailAccountId,
  provider,
  logger,
  dryRun = false,
  batchSize = DEFAULT_BATCH_SIZE,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  maxErrorsPerAccount = DEFAULT_MAX_ERRORS_PER_ACCOUNT,
  softTimeLimitMs = DEFAULT_SOFT_TIME_LIMIT_MS,
  deadlineAt: providedDeadlineAt,
}: EmailMessageStatsReconciliationOptions): Promise<AccountReconciliationResult> {
  const accountLogger = logger.with({ emailAccountId });
  const deadlineAt = optionsDeadlineAt({
    deadlineAt: providedDeadlineAt,
    softTimeLimitMs,
  });
  const result = createEmptyAccountResult({ emailAccountId, dryRun });

  if (provider.name !== GOOGLE_PROVIDER) return result;

  const rows = await prisma.emailMessage.findMany({
    where: { emailAccountId },
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: batchSize + 1,
    select: {
      id: true,
      messageId: true,
      threadId: true,
    },
  });

  const candidates = rows.slice(0, batchSize);
  result.scanned = candidates.length;

  for (const row of candidates) {
    if (Date.now() > deadlineAt) {
      result.stoppedEarly = "time-limit";
      break;
    }

    await reconcileEmailMessageStatsRow({
      emailAccountId,
      provider,
      row,
      logger: accountLogger,
      dryRun,
      result,
      sampleLimit,
    });

    if (result.errors >= maxErrorsPerAccount) {
      result.stoppedEarly = "max-errors";
      break;
    }
  }

  result.hasMore =
    rows.length > batchSize ||
    result.checked < candidates.length ||
    !!result.stoppedEarly;

  accountLogger.info("EmailMessage stats reconciliation completed", {
    dryRun,
    scanned: result.scanned,
    checked: result.checked,
    deleted: result.deleted,
    wouldDelete: result.wouldDelete,
    upserted: result.upserted,
    wouldUpsert: result.wouldUpsert,
    errors: result.errors,
    hasMore: result.hasMore,
    stoppedEarly: result.stoppedEarly,
  });

  return result;
}

export async function reconcileConfiguredGmailEmailMessageStats({
  logger,
  emailAccountId,
  dryRun = false,
  accountLimit = DEFAULT_ACCOUNT_LIMIT,
  batchSize = DEFAULT_BATCH_SIZE,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  maxErrorsPerAccount = DEFAULT_MAX_ERRORS_PER_ACCOUNT,
  softTimeLimitMs = DEFAULT_SOFT_TIME_LIMIT_MS,
}: ConfiguredAccountsReconciliationOptions): Promise<ConfiguredAccountsReconciliationResult> {
  const deadlineAt = Date.now() + softTimeLimitMs;
  const result = createEmptyConfiguredResult(dryRun);

  const accounts = emailAccountId
    ? await getExplicitAccountCandidate(emailAccountId)
    : await getOldestGoogleAccountCandidates(accountLimit);

  for (const account of accounts) {
    if (Date.now() > deadlineAt) {
      result.stoppedEarly = "time-limit";
      break;
    }

    if (account.provider !== GOOGLE_PROVIDER) {
      result.accountsSkipped += 1;
      continue;
    }

    const accountLogger = logger.with({ emailAccountId: account.id });

    try {
      const provider = await createEmailProvider({
        emailAccountId: account.id,
        provider: account.provider,
        logger: accountLogger,
      });

      const accountResult = await reconcileEmailMessageStatsForAccount({
        emailAccountId: account.id,
        provider,
        logger: accountLogger,
        dryRun,
        batchSize,
        sampleLimit,
        maxErrorsPerAccount,
        softTimeLimitMs,
        deadlineAt,
      });

      result.accountsChecked += 1;
      result.accounts.push(accountResult);
      addAccountTotals(result, accountResult);
      if (accountResult.stoppedEarly === "time-limit") {
        result.stoppedEarly = "time-limit";
        break;
      }
    } catch (error) {
      accountLogger.error("EmailMessage stats reconciliation failed", {
        error,
      });
      result.failedAccounts += 1;
      result.totals.errors += 1;
    }
  }

  return result;
}

async function reconcileEmailMessageStatsRow({
  emailAccountId,
  provider,
  row,
  logger,
  dryRun,
  result,
  sampleLimit,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  row: EmailMessageStatsCandidate;
  logger: Logger;
  dryRun: boolean;
  result: AccountReconciliationResult;
  sampleLimit: number;
}) {
  result.checked += 1;

  try {
    const message = await provider.getMessage(row.messageId);
    const labels = message.labelIds ?? [];

    if (shouldExcludeFromEmailMessageStats(message)) {
      if (dryRun) {
        result.wouldDelete += 1;
        addSample(result, sampleLimit, {
          messageId: row.messageId,
          threadId: row.threadId,
          action: "would-delete-excluded-label",
          labels,
        });
      } else {
        await deleteEmailMessageStats({
          emailAccountId,
          messageId: row.messageId,
          threadId: row.threadId,
          reason: "stats-reconciliation-excluded-label",
          logger,
        });
        result.deleted += 1;
        result.deletedExcludedLabel += 1;
        addSample(result, sampleLimit, {
          messageId: row.messageId,
          threadId: row.threadId,
          action: "deleted-excluded-label",
          labels,
        });
      }
      return;
    }

    if (dryRun) {
      result.wouldUpsert += 1;
      if (row.threadId !== message.threadId) result.threadIdChanged += 1;
      addSample(result, sampleLimit, {
        messageId: row.messageId,
        threadId: row.threadId,
        action:
          row.threadId === message.threadId
            ? "would-upsert"
            : "would-replace-thread-id",
        labels,
      });
      return;
    }

    await reconcileEmailMessageStatsFromParsedMessage({
      emailAccountId,
      message,
      logger,
      reason: "stats-reconciliation-current-state",
    });
    result.upserted += 1;

    if (row.threadId !== message.threadId) {
      await deleteEmailMessageStats({
        emailAccountId,
        messageId: row.messageId,
        threadId: row.threadId,
        reason: "stats-reconciliation-thread-id-changed",
        logger,
      });
      result.threadIdChanged += 1;
      addSample(result, sampleLimit, {
        messageId: row.messageId,
        threadId: row.threadId,
        action: "replaced-thread-id",
        labels,
      });
      return;
    }

    addSample(result, sampleLimit, {
      messageId: row.messageId,
      threadId: row.threadId,
      action: "upserted",
      labels,
    });
  } catch (error) {
    if (isGmailMessageNotFoundError(error)) {
      if (dryRun) {
        result.wouldDelete += 1;
        addSample(result, sampleLimit, {
          messageId: row.messageId,
          threadId: row.threadId,
          action: "would-delete-not-found",
        });
      } else {
        await deleteEmailMessageStats({
          emailAccountId,
          messageId: row.messageId,
          threadId: row.threadId,
          reason: "stats-reconciliation-message-not-found",
          logger,
        });
        result.deleted += 1;
        result.deletedNotFound += 1;
        addSample(result, sampleLimit, {
          messageId: row.messageId,
          threadId: row.threadId,
          action: "deleted-not-found",
        });
      }
      return;
    }

    logger.error("Failed to reconcile EmailMessage stats row", {
      messageId: row.messageId,
      threadId: row.threadId,
      error,
    });
    result.errors += 1;
    addSample(result, sampleLimit, {
      messageId: row.messageId,
      threadId: row.threadId,
      action: "error",
      error: getErrorMessage(error),
    });
  }
}

async function getExplicitAccountCandidate(emailAccountId: string) {
  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      account: { disconnectedAt: null },
    },
    select: {
      id: true,
      account: { select: { provider: true } },
    },
  });

  if (!emailAccount) return [];

  return [
    {
      id: emailAccount.id,
      provider: emailAccount.account.provider,
      localEmailMessageCount: 0,
    },
  ];
}

async function getOldestGoogleAccountCandidates(accountLimit: number) {
  return prisma.$queryRaw<AccountCandidate[]>(Prisma.sql`
    SELECT
      ea."id",
      a."provider",
      COUNT(em."id") AS "localEmailMessageCount"
    FROM "EmailAccount" ea
    JOIN "Account" a ON a."id" = ea."accountId"
    JOIN "EmailMessage" em ON em."emailAccountId" = ea."id"
    WHERE a."provider" = ${GOOGLE_PROVIDER}
      AND a."disconnectedAt" IS NULL
    GROUP BY ea."id", a."provider"
    ORDER BY MIN(em."updatedAt") ASC, ea."id" ASC
    LIMIT ${accountLimit}
  `);
}

function createEmptyAccountResult({
  emailAccountId,
  dryRun,
}: {
  emailAccountId: string;
  dryRun: boolean;
}): AccountReconciliationResult {
  return {
    emailAccountId,
    dryRun,
    scanned: 0,
    checked: 0,
    upserted: 0,
    wouldUpsert: 0,
    deleted: 0,
    wouldDelete: 0,
    deletedNotFound: 0,
    deletedExcludedLabel: 0,
    threadIdChanged: 0,
    errors: 0,
    hasMore: false,
    samples: [],
  };
}

function createEmptyConfiguredResult(
  dryRun: boolean,
): ConfiguredAccountsReconciliationResult {
  return {
    dryRun,
    accountsChecked: 0,
    accountsSkipped: 0,
    failedAccounts: 0,
    totals: {
      scanned: 0,
      checked: 0,
      upserted: 0,
      wouldUpsert: 0,
      deleted: 0,
      wouldDelete: 0,
      deletedNotFound: 0,
      deletedExcludedLabel: 0,
      threadIdChanged: 0,
      errors: 0,
    },
    accounts: [],
  };
}

function optionsDeadlineAt({
  deadlineAt,
  softTimeLimitMs,
}: {
  deadlineAt?: number;
  softTimeLimitMs: number;
}) {
  return deadlineAt ?? Date.now() + softTimeLimitMs;
}

function addAccountTotals(
  configuredResult: ConfiguredAccountsReconciliationResult,
  accountResult: AccountReconciliationResult,
) {
  configuredResult.totals.scanned += accountResult.scanned;
  configuredResult.totals.checked += accountResult.checked;
  configuredResult.totals.upserted += accountResult.upserted;
  configuredResult.totals.wouldUpsert += accountResult.wouldUpsert;
  configuredResult.totals.deleted += accountResult.deleted;
  configuredResult.totals.wouldDelete += accountResult.wouldDelete;
  configuredResult.totals.deletedNotFound += accountResult.deletedNotFound;
  configuredResult.totals.deletedExcludedLabel +=
    accountResult.deletedExcludedLabel;
  configuredResult.totals.threadIdChanged += accountResult.threadIdChanged;
  configuredResult.totals.errors += accountResult.errors;
}

function addSample(
  result: AccountReconciliationResult,
  sampleLimit: number,
  sample: ReconciliationSample,
) {
  if (result.samples.length >= sampleLimit) return;
  result.samples.push(sample);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
