import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { getEmailFieldStats } from "./helpers";

vi.mock("@/utils/prisma");

describe("getEmailFieldStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { value: "alerts@bank.com", count: 55n },
      { value: "news@substack.com", count: 12n },
    ]);
  });

  it("counts a sender once whatever the letter case of their address", async () => {
    const result = await getEmailFieldStats({
      emailAccountId: "email-account-1",
      field: "from",
      isSent: false,
    });

    expect(result.data).toEqual([
      { from: "alerts@bank.com", count: 55 },
      { from: "news@substack.com", count: 12 },
    ]);

    const sql = getQueryText();
    expect(sql).toContain('SELECT LOWER("from") AS "value"');
    expect(sql).toContain('GROUP BY LOWER("from")');
  });

  it("groups domains case-insensitively and names the result field from", async () => {
    const result = await getEmailFieldStats({
      emailAccountId: "email-account-1",
      field: "fromDomain",
      isSent: false,
      fromDate: Date.parse("2026-10-01T00:00:00.000Z"),
    });

    expect(result.data[0]).toEqual({ from: "alerts@bank.com", count: 55 });
    expect(getQueryText()).toContain('GROUP BY LOWER("fromDomain")');
    expect(getQueryValues()).toEqual(
      expect.arrayContaining([
        "email-account-1",
        false,
        new Date("2026-10-01T00:00:00.000Z"),
      ]),
    );
  });
});

function getQueryText() {
  return getQuery().sql;
}

function getQueryValues() {
  return getQuery().values;
}

function getQuery() {
  const [query] = vi.mocked(prisma.$queryRaw).mock.calls[0] as [Prisma.Sql];
  return query;
}
