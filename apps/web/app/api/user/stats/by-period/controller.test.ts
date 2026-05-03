import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { getStatsByPeriod } from "./controller";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

describe("getStatsByPeriod", () => {
  beforeEach(() => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
  });

  it("passes the period as a query parameter", async () => {
    await getStatsByPeriod({
      emailAccountId: "email-account-1",
      period: "month",
    });

    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);

    const queryArgs = vi.mocked(prisma.$queryRaw).mock.calls[0];

    expect(queryArgs).toContain("month");
    expect(JSON.stringify(queryArgs)).not.toContain("'month'");
  });
});
