import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

vi.mock("@/utils/prisma");

vi.mock("@/utils/middleware", async () => {
  const { createWithEmailAccountTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithEmailAccountTestMiddleware();
});

import { GET } from "./route";

describe("GET /api/user/stats/sender-emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { startOfPeriod: new Date("2026-10-05T00:00:00.000Z"), count: 3n },
    ]);
  });

  it("matches the sender whatever the letter case of the stored address", async () => {
    const response = await GET(
      new Request(
        "http://localhost:3000/api/user/stats/sender-emails?fromEmail=news%40substack.com&period=week",
      ) as never,
      {} as never,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      result: [{ startOfPeriod: "Oct 05, 2026", Emails: 3 }],
    });

    const [query] = vi.mocked(prisma.$queryRaw).mock.calls[0] as [Prisma.Sql];
    expect(query.sql).toContain('LOWER("from") = LOWER(?)');
    expect(query.values).toContain("news@substack.com");
  });
});
