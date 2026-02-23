import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDigestSummaryWindowStart,
  hasReachedDigestSummaryLimit,
} from "@/utils/digest/summary-limit";

vi.mock("@/utils/prisma");

describe("getDigestSummaryWindowStart", () => {
  it("returns a date exactly 24 hours before now", () => {
    const now = new Date("2026-02-23T12:34:56.000Z");

    const result = getDigestSummaryWindowStart(now);

    expect(result.toISOString()).toBe("2026-02-22T12:34:56.000Z");
  });
});

describe("hasReachedDigestSummaryLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false without querying prisma when limit is disabled", async () => {
    const reached = await hasReachedDigestSummaryLimit({
      emailAccountId: "account-1",
      maxSummariesPer24h: 0,
      now: new Date("2026-02-23T12:00:00.000Z"),
    });

    expect(reached).toBe(false);
    expect(prisma.digestItem.count).not.toHaveBeenCalled();
  });

  it("returns true when summaries in window meet limit", async () => {
    const now = new Date("2026-02-23T12:00:00.000Z");
    vi.mocked(prisma.digestItem.count).mockResolvedValue(50);

    const reached = await hasReachedDigestSummaryLimit({
      emailAccountId: "account-1",
      maxSummariesPer24h: 50,
      now,
    });

    expect(reached).toBe(true);
    expect(prisma.digestItem.count).toHaveBeenCalledWith({
      where: {
        digest: {
          emailAccountId: "account-1",
        },
        createdAt: {
          gte: new Date("2026-02-22T12:00:00.000Z"),
        },
      },
    });
  });

  it("returns false when summaries in window are below limit", async () => {
    vi.mocked(prisma.digestItem.count).mockResolvedValue(49);

    const reached = await hasReachedDigestSummaryLimit({
      emailAccountId: "account-1",
      maxSummariesPer24h: 50,
      now: new Date("2026-02-23T12:00:00.000Z"),
    });

    expect(reached).toBe(false);
  });
});
