import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { getMemberActivityStatus } from "@/utils/member-activity";
import { withAdmin } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { rollUpUserStatus } from "./user-status";

const LIMIT = 50;

// A bad ?page would otherwise reach Prisma as NaN or a negative skip and 500.
const pageParam = z.coerce.number().int().min(1).catch(1);

// Only filters a SQL WHERE can express. Activity status is derived after the
// page is fetched, so offering "active"/"inactive" here would silently filter
// within the current page instead of across all users.
const FILTERS = ["all", "disconnected", "errors"] as const;
type UserFilter = (typeof FILTERS)[number];

export type GetAdminUsersResponse = Awaited<ReturnType<typeof getUsers>>;

export const GET = withAdmin("admin/users", async (request) => {
  const { searchParams } = new URL(request.url);
  const page = pageParam.parse(searchParams.get("page"));
  const search = searchParams.get("q")?.trim() || "";
  const filter = parseFilter(searchParams.get("filter"));

  return NextResponse.json(await getUsers({ page, search, filter }));
});

async function getUsers({
  page,
  search,
  filter,
}: {
  page: number;
  search: string;
  filter: UserFilter;
}) {
  const where = buildWhere({ search, filter });

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      take: LIMIT,
      skip: (page - 1) * LIMIT,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        lastLogin: true,
        completedOnboardingAt: true,
        errorMessages: true,
        emailAccounts: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            email: true,
            watchEmailsExpirationDate: true,
            account: { select: { provider: true, disconnectedAt: true } },
            _count: { select: { rules: true } },
          },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  const lastActivity = await getLastActivityByAccount(
    users.flatMap((user) => user.emailAccounts.map((account) => account.id)),
  );

  const now = new Date();

  const results = users.map((user) => {
    const emailAccounts = user.emailAccounts.map((emailAccount) => {
      const lastProcessedEmailAt =
        lastActivity.get(emailAccount.id) ?? undefined;

      return {
        id: emailAccount.id,
        email: emailAccount.email,
        provider: emailAccount.account?.provider ?? null,
        disconnectedAt: emailAccount.account?.disconnectedAt ?? null,
        watchExpiresAt: emailAccount.watchEmailsExpirationDate,
        rulesCount: emailAccount._count.rules,
        lastProcessedEmailAt: lastProcessedEmailAt ?? null,
        status: getMemberActivityStatus({
          // System admins have no analytics privacy gate, so "hidden" never
          // applies here.
          allowOrgAdminAnalytics: true,
          disconnectedAt: emailAccount.account?.disconnectedAt,
          lastProcessedEmailAt,
          now,
        }),
      };
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      onboarded: user.completedOnboardingAt !== null,
      errorCount: countErrors(user.errorMessages),
      status: rollUpUserStatus(emailAccounts.map((account) => account.status)),
      emailAccounts,
    };
  });

  return { results, totalPages: Math.ceil(total / LIMIT) };
}

function buildWhere({
  search,
  filter,
}: {
  search: string;
  filter: UserFilter;
}): Prisma.UserWhereInput {
  return {
    ...buildSearchWhere(search),
    ...(filter === "disconnected" && {
      accounts: { some: { disconnectedAt: { not: null } } },
    }),
    // Prisma has no "non-empty JSON" filter. NOT ("errorMessages" = '{}')
    // already excludes SQL NULL by three-valued logic, so this selects exactly
    // the same rows as HAS_ERROR_MESSAGES in utils/error-messages/query.ts,
    // which the errors page uses. Verified against Postgres.
    ...(filter === "errors" && {
      AND: [
        { errorMessages: { not: Prisma.DbNull } },
        { errorMessages: { not: {} } },
      ],
    }),
  };
}

/**
 * A complete address hits the unique index; anything else falls back to an
 * unindexable ILIKE, which is fine at this scale. Add pg_trgm if the user
 * table ever passes a few hundred thousand rows.
 */
function buildSearchWhere(search: string): Prisma.UserWhereInput {
  if (!search) return {};
  if (isEmailAddress(search)) return { email: search.toLowerCase() };

  return {
    OR: [
      { email: { contains: search, mode: "insensitive" } },
      { name: { contains: search, mode: "insensitive" } },
      {
        emailAccounts: {
          some: { email: { contains: search, mode: "insensitive" } },
        },
      },
    ],
  };
}

/**
 * Newest ExecutedRule per account, bounded to the accounts on this page.
 *
 * The bound is what makes this cheap: ExecutedRule_emailAccountId_createdAt_idx
 * serves each account directly. Do not widen it to every account the way
 * organizations/[organizationId]/executed-rules-count does — that aggregates
 * the whole table.
 */
async function getLastActivityByAccount(emailAccountIds: string[]) {
  if (!emailAccountIds.length) return new Map<string, Date>();

  const rows = await prisma.executedRule.groupBy({
    by: ["emailAccountId"],
    where: { emailAccountId: { in: emailAccountIds } },
    _max: { createdAt: true },
  });

  return new Map(
    rows.flatMap((row) =>
      row._max.createdAt ? [[row.emailAccountId, row._max.createdAt]] : [],
    ),
  );
}

function countErrors(errorMessages: unknown) {
  if (!errorMessages || typeof errorMessages !== "object") return 0;
  return Object.keys(errorMessages).length;
}

function isEmailAddress(value: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function parseFilter(value: string | null): UserFilter {
  return FILTERS.includes(value as UserFilter) ? (value as UserFilter) : "all";
}
