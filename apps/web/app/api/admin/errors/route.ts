import { NextResponse } from "next/server";
import { HAS_ERROR_MESSAGES } from "@/utils/error-messages/query";
import { withAdmin } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const FEED_LIMIT = 50;
const BROKEN_USER_LIMIT = 50;
const DETAIL_MAX_LENGTH = 1000;

export type GetAdminErrorsResponse = Awaited<ReturnType<typeof getErrors>>;

type FeedEntry = {
  id: string;
  source: "automation" | "rule" | "scheduled";
  at: Date;
  email: string | null;
  summary: string;
  detail: string | null;
};

export const GET = withAdmin("admin/errors", async () =>
  NextResponse.json(await getErrors()),
);

async function getErrors() {
  const [
    brokenUsers,
    byErrorType,
    automationRuns,
    scheduledActions,
    ruleRuns,
    summary,
  ] = await Promise.all([
    getBrokenUsers(),
    getErrorTypeBreakdown(),
    getFailedAutomationRuns(),
    getFailedScheduledActions(),
    getRuleErrors(),
    getSummaryCounts(),
  ]);

  const emailsByAccountId = await resolveAccountEmails([
    ...automationRuns.map((run) => run.automationJob.emailAccountId),
    ...scheduledActions.map((action) => action.emailAccountId),
  ]);

  const feed: FeedEntry[] = [
    ...automationRuns.map((run) => ({
      id: run.id,
      source: "automation" as const,
      at: run.createdAt,
      email: emailsByAccountId.get(run.automationJob.emailAccountId) ?? null,
      summary: "Automation job run failed",
      detail: truncate(run.error),
    })),
    ...scheduledActions.map((action) => ({
      id: action.id,
      source: "scheduled" as const,
      at: action.scheduledFor,
      email: emailsByAccountId.get(action.emailAccountId) ?? null,
      summary: `Scheduled ${action.actionType} action failed`,
      detail: null,
    })),
    ...ruleRuns.map((run) => ({
      id: run.id,
      source: "rule" as const,
      at: run.createdAt,
      email: run.email,
      summary: run.ruleName
        ? `Rule "${run.ruleName}" errored`
        : "Rule execution errored",
      detail: truncate(run.reason),
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, FEED_LIMIT);

  return {
    summary,
    byErrorType,
    brokenUsers,
    feed,
  };
}

/**
 * Real totals, not the lengths of the LIMIT-ed lists below — those would pin
 * at 50 once there are more failures than that, and would disagree with the
 * same figure on the overview page.
 */
async function getSummaryCounts() {
  const [usersInErrorState, failedAutomationRuns, failedScheduledActions] =
    await Promise.all([
      countUsersInErrorState(),
      prisma.automationJobRun.count({ where: { status: "FAILED" } }),
      prisma.scheduledAction.count({ where: { status: "FAILED" } }),
    ]);

  return {
    usersInErrorState,
    failedAutomationRuns,
    failedScheduledActions,
    ruleErrors: await countRuleErrors(),
  };
}

async function countUsersInErrorState() {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "User" WHERE ${HAS_ERROR_MESSAGES}
  `;
  return rows[0]?.count ?? 0;
}

// Inline 'ERROR' literal for the same reason as getRuleErrors below.
async function countRuleErrors() {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count FROM "ExecutedRule" WHERE "status" = 'ERROR'
  `;
  return rows[0]?.count ?? 0;
}

/**
 * Users carrying a non-empty errorMessages blob.
 *
 * Deliberately not getUserErrorMessages(): that helper is not a pure read — it
 * strips expired trial errors and writes back — so calling it per row here
 * would issue a write per user.
 *
 * The predicate must imply User_errorMessages_updatedAt_idx for Postgres to
 * use that partial index.
 */
async function getBrokenUsers() {
  const rows = await prisma.$queryRaw<
    { id: string; email: string; errorMessages: unknown; updatedAt: Date }[]
  >`
    SELECT id, email, "errorMessages", "updatedAt"
    FROM "User"
    WHERE ${HAS_ERROR_MESSAGES}
    ORDER BY "updatedAt" DESC
    LIMIT ${BROKEN_USER_LIMIT}
  `;

  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    updatedAt: row.updatedAt,
    errors: parseErrorMessages(row.errorMessages),
  }));
}

/**
 * split_part is load-bearing: watchLapsedErrorKey() stores the key as
 * "Email automation stopped:<emailAccountId>", so without it every lapsed
 * watch would count as its own error type. Keys are the human-readable
 * ErrorType values, not the constant names.
 *
 * COUNT(DISTINCT u.id) rather than COUNT(*): jsonb_each emits one row per
 * (user, key), so a user with several lapsed mailboxes would otherwise be
 * counted once per mailbox under the same collapsed type.
 *
 * jsonb_each raises on a non-object, which would 500 the page, so the type
 * guard is a cheap backstop against a malformed blob.
 */
async function getErrorTypeBreakdown() {
  return prisma.$queryRaw<{ errorType: string; count: number }[]>`
    SELECT split_part(key, ':', 1) AS "errorType",
           COUNT(DISTINCT u.id)::int AS count
    FROM "User" u, jsonb_each(u."errorMessages")
    WHERE ${HAS_ERROR_MESSAGES} AND jsonb_typeof(u."errorMessages") = 'object'
    GROUP BY 1
    ORDER BY 2 DESC
  `;
}

// Served by AutomationJobRun @@index([status, createdAt]).
function getFailedAutomationRuns() {
  return prisma.automationJobRun.findMany({
    where: { status: "FAILED" },
    orderBy: { createdAt: "desc" },
    take: FEED_LIMIT,
    select: {
      id: true,
      createdAt: true,
      error: true,
      // AutomationJobRun has no emailAccountId of its own.
      automationJob: { select: { emailAccountId: true } },
    },
  });
}

// Served by ScheduledAction @@index([status, scheduledFor]).
function getFailedScheduledActions() {
  return prisma.scheduledAction.findMany({
    where: { status: "FAILED" },
    orderBy: { scheduledFor: "desc" },
    take: FEED_LIMIT,
    select: {
      id: true,
      scheduledFor: true,
      actionType: true,
      emailAccountId: true,
    },
  });
}

/**
 * Raw SQL with an inline 'ERROR' literal rather than the usual
 * ${value}::text::"Enum" parameter cast: a bound parameter stops Postgres
 * choosing the partial ExecutedRule_error_createdAt_idx. No user input is
 * interpolated.
 */
function getRuleErrors() {
  return prisma.$queryRaw<
    {
      id: string;
      createdAt: Date;
      reason: string | null;
      email: string;
      ruleName: string | null;
    }[]
  >`
    SELECT er.id, er."createdAt", er.reason, ea.email, r.name AS "ruleName"
    FROM "ExecutedRule" er
    JOIN "EmailAccount" ea ON ea.id = er."emailAccountId"
    LEFT JOIN "Rule" r ON r.id = er."ruleId"
    WHERE er."status" = 'ERROR'
    ORDER BY er."createdAt" DESC
    LIMIT ${FEED_LIMIT}
  `;
}

async function resolveAccountEmails(emailAccountIds: string[]) {
  const ids = [...new Set(emailAccountIds)];
  if (!ids.length) return new Map<string, string>();

  const accounts = await prisma.emailAccount.findMany({
    where: { id: { in: ids } },
    select: { id: true, email: true },
  });

  return new Map(accounts.map((account) => [account.id, account.email]));
}

function parseErrorMessages(errorMessages: unknown) {
  if (!errorMessages || typeof errorMessages !== "object") return [];

  return Object.entries(errorMessages as Record<string, unknown>).map(
    ([key, value]) => {
      const entry = (value ?? {}) as { message?: unknown; timestamp?: unknown };
      return {
        // The raw key is unique per entry; errorType collapses the
        // "<type>:<emailAccountId>" form the watch-lapsed error uses, so
        // several entries can share one errorType.
        key,
        errorType: key.split(":")[0],
        message: typeof entry.message === "string" ? entry.message : "",
        timestamp: typeof entry.timestamp === "string" ? entry.timestamp : null,
      };
    },
  );
}

function truncate(value: string | null) {
  if (!value) return null;
  return value.length > DETAIL_MAX_LENGTH
    ? `${value.slice(0, DETAIL_MAX_LENGTH)}…`
    : value;
}
