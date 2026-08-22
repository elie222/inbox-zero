import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { Resolved } from "./Resolved";

vi.mock("@/utils/prisma");

describe("Resolved", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-22T12:00:00.000Z"));
    vi.mocked(prisma.$queryRaw)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0n }]);
    vi.mocked(prisma.threadTracker.findMany).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("binds the time cutoff as a date in both resolved-thread queries", async () => {
    await Resolved({
      emailAccountId: "email-account-1",
      userEmail: "user@example.com",
      page: 1,
      timeRange: "3d",
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);

    const dateClauses = vi
      .mocked(prisma.$queryRaw)
      .mock.calls.map(([, , dateClause]) => dateClause as Prisma.Sql);

    for (const dateClause of dateClauses) {
      expect(dateClause.values).toEqual([new Date("2026-08-19T12:00:00.000Z")]);
    }
  });
});
