import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithAdminTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAdminTestMiddleware();
});

import { GET } from "./route";

const NOW = new Date("2026-07-30T12:00:00.000Z");

function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    email: "someone@example.com",
    name: "Someone",
    createdAt: NOW,
    lastLogin: NOW,
    completedOnboardingAt: NOW,
    errorMessages: null,
    emailAccounts: [
      {
        id: "account-1",
        email: "someone@example.com",
        watchEmailsExpirationDate: null,
        account: { provider: "google", disconnectedAt: null },
        _count: { rules: 3 },
      },
    ],
    ...overrides,
  };
}

async function callRoute(url = "http://localhost:3000/api/admin/users") {
  const response = await GET(new NextRequest(url));
  return response.json();
}

describe("GET /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findMany.mockResolvedValue([buildUser()] as never);
    prisma.user.count.mockResolvedValue(1 as never);
    prisma.executedRule.groupBy.mockResolvedValue([] as never);
  });

  it("returns totalPages so TablePagination can consume it", async () => {
    prisma.user.count.mockResolvedValue(120 as never);

    const body = await callRoute();

    expect(body.totalPages).toBe(3);
  });

  // The bound is what keeps this cheap: an unbounded groupBy would aggregate
  // every ExecutedRule row in the database.
  it("scopes the last-activity lookup to the accounts on this page", async () => {
    await callRoute();

    expect(prisma.executedRule.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { emailAccountId: { in: ["account-1"] } },
        _max: { createdAt: true },
      }),
    );
  });

  it("skips the activity lookup when no accounts are on the page", async () => {
    prisma.user.findMany.mockResolvedValue([
      buildUser({ emailAccounts: [] }),
    ] as never);

    const body = await callRoute();

    expect(prisma.executedRule.groupBy).not.toHaveBeenCalled();
    expect(body.results[0].status).toBeNull();
  });

  it("reports a disconnected mailbox as the user's status", async () => {
    prisma.user.findMany.mockResolvedValue([
      buildUser({
        emailAccounts: [
          {
            id: "account-1",
            email: "someone@example.com",
            watchEmailsExpirationDate: null,
            account: { provider: "google", disconnectedAt: NOW },
            _count: { rules: 0 },
          },
        ],
      }),
    ] as never);

    const body = await callRoute();

    expect(body.results[0].status).toBe("disconnected");
  });

  it("counts the entries in a user's error blob", async () => {
    prisma.user.findMany.mockResolvedValue([
      buildUser({
        errorMessages: {
          "Incorrect API key": { message: "bad key", timestamp: "x" },
          "Account disconnected": { message: "reconnect", timestamp: "x" },
        },
      }),
    ] as never);

    const body = await callRoute();

    expect(body.results[0].errorCount).toBe(2);
  });

  // A complete address can use the unique index instead of an ILIKE scan.
  it("looks up a full email address exactly", async () => {
    await callRoute(
      "http://localhost:3000/api/admin/users?q=someone%40example.com",
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ email: "someone@example.com" }),
      }),
    );
  });

  it("falls back to searching name, email and mailbox for a partial term", async () => {
    await callRoute("http://localhost:3000/api/admin/users?q=some");

    const where = prisma.user.findMany.mock.calls.at(-1)?.[0]?.where as {
      OR?: unknown[];
    };
    expect(where.OR).toEqual([
      { email: { contains: "some", mode: "insensitive" } },
      { name: { contains: "some", mode: "insensitive" } },
      {
        emailAccounts: {
          some: { email: { contains: "some", mode: "insensitive" } },
        },
      },
    ]);
  });

  it("filters to users with a disconnected account", async () => {
    await callRoute(
      "http://localhost:3000/api/admin/users?filter=disconnected",
    );

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accounts: { some: { disconnectedAt: { not: null } } } },
      }),
    );
  });

  // Must select the same rows as HAS_ERROR_MESSAGES, which the errors page
  // uses — otherwise the two admin pages disagree about who is broken.
  it("filters to users with a non-empty error blob", async () => {
    await callRoute("http://localhost:3000/api/admin/users?filter=errors");

    const where = prisma.user.findMany.mock.calls.at(-1)?.[0]?.where as {
      AND?: unknown[];
    };
    expect(where.AND).toHaveLength(2);
    expect(where.AND).toContainEqual({ errorMessages: { not: {} } });
  });

  it.each([
    "abc",
    "0",
    "-3",
  ])("falls back to the first page for ?page=%s", async (page) => {
    await callRoute(`http://localhost:3000/api/admin/users?page=${page}`);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0 }),
    );
  });

  // Activity status is computed after the page is fetched, so an
  // "active"/"inactive" filter would only filter within the page.
  it("ignores a filter the query cannot express", async () => {
    await callRoute("http://localhost:3000/api/admin/users?filter=active");

    const where = prisma.user.findMany.mock.calls.at(-1)?.[0]?.where;
    expect(where).toEqual({});
  });
});
