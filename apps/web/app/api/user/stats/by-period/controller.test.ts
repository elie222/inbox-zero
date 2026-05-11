import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { getStatsByPeriod } from "./controller";

vi.mock("@/utils/prisma");

describe("getStatsByPeriod", () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  });

  it("keeps the period out of raw SQL if validation is bypassed", async () => {
    const maliciousPeriod = 'month\'); DROP TABLE "EmailMessage"; --';

    await getStatsByPeriod({
      emailAccountId: "email-account-1",
      period: maliciousPeriod as never,
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    const queryArgs = vi.mocked(prisma.$queryRaw).mock.calls[0];
    const [queryStrings, ...queryValues] = queryArgs as [
      readonly string[],
      ...unknown[],
    ];
    const rawSqlText = queryStrings.join("");

    expect(rawSqlText).not.toContain(maliciousPeriod);
    expect(queryValues).toContain(maliciousPeriod);
  });
});
