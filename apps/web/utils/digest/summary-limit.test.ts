import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  getDigestSummaryWindowStart,
  hasReachedDigestSummaryLimit,
  releaseDigestSummarySlot,
  reserveDigestSummarySlot,
} from "@/utils/digest/summary-limit";
import { redis } from "@/utils/redis";

vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({
  redis: {
    eval: vi.fn(),
    zrem: vi.fn(),
  },
}));

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

describe("reserveDigestSummarySlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true without querying redis when limit is disabled", async () => {
    const reserved = await reserveDigestSummarySlot({
      emailAccountId: "account-1",
      maxSummariesPer24h: 0,
      now: new Date("2026-02-23T12:00:00.000Z"),
    });

    expect(reserved).toEqual({
      reserved: true,
      reservationId: null,
      reservationSource: null,
    });
    expect(redis.eval).not.toHaveBeenCalled();
    expect(prisma.digestItem.count).not.toHaveBeenCalled();
  });

  it("returns reservation id when redis reserves a slot", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);
    const now = new Date("2026-02-23T12:00:00.000Z");

    const result = await reserveDigestSummarySlot({
      emailAccountId: "account-1",
      maxSummariesPer24h: 50,
      now,
    });

    expect(result.reserved).toBe(true);
    expect(result.reservationId).toMatch(new RegExp(`^${now.getTime()}:`));
    expect(result.reservationSource).toBe("redis");
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("ZREMRANGEBYSCORE"),
      ["digest:summary-limit:account-1"],
      expect.arrayContaining(["50"]),
    );
  });

  it("returns not reserved when redis rejects the reservation", async () => {
    vi.mocked(redis.eval).mockResolvedValue(0);

    const reserved = await reserveDigestSummarySlot({
      emailAccountId: "account-1",
      maxSummariesPer24h: 50,
      now: new Date("2026-02-23T12:00:00.000Z"),
    });

    expect(reserved).toEqual({
      reserved: false,
      reservationId: null,
      reservationSource: null,
    });
  });

  it("falls back to a prisma-backed reservation when redis fails", async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error("redis down"));
    vi.mocked(prisma.$transaction).mockResolvedValue("reservation-1" as never);

    const reserved = await reserveDigestSummarySlot({
      emailAccountId: "account-1",
      maxSummariesPer24h: 50,
      now: new Date("2026-02-23T12:00:00.000Z"),
    });

    expect(reserved).toEqual({
      reserved: true,
      reservationId: "reservation-1",
      reservationSource: "prisma",
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("returns not reserved when redis fails and prisma fallback cannot reserve", async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error("redis down"));
    vi.mocked(prisma.$transaction).mockResolvedValue(null);

    const reserved = await reserveDigestSummarySlot({
      emailAccountId: "account-1",
      maxSummariesPer24h: 50,
      now: new Date("2026-02-23T12:00:00.000Z"),
    });

    expect(reserved).toEqual({
      reserved: false,
      reservationId: null,
      reservationSource: null,
    });
  });
});

describe("releaseDigestSummarySlot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("removes a redis reservation from the account limit set", async () => {
    vi.mocked(redis.zrem).mockResolvedValue(1);

    const released = await releaseDigestSummarySlot({
      emailAccountId: "account-1",
      reservationId: "reservation-1",
      reservationSource: "redis",
    });

    expect(released).toBe(true);
    expect(redis.zrem).toHaveBeenCalledWith(
      "digest:summary-limit:account-1",
      "reservation-1",
    );
  });

  it("removes a prisma fallback reservation placeholder", async () => {
    prisma.digestItem.deleteMany.mockResolvedValue({ count: 1 });

    const released = await releaseDigestSummarySlot({
      emailAccountId: "account-1",
      reservationId: "reservation-1",
      reservationSource: "prisma",
    });

    expect(released).toBe(true);
    expect(prisma.digestItem.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "reservation-1",
        content: "__digest_summary_reservation__",
        digest: {
          emailAccountId: "account-1",
        },
      },
    });
  });

  it("returns false when redis reservation does not exist", async () => {
    vi.mocked(redis.zrem).mockResolvedValue(0);

    const released = await releaseDigestSummarySlot({
      emailAccountId: "account-1",
      reservationId: "reservation-1",
      reservationSource: "redis",
    });

    expect(released).toBe(false);
  });

  it("returns false when reservation source is missing", async () => {
    const released = await releaseDigestSummarySlot({
      emailAccountId: "account-1",
      reservationId: "reservation-1",
      reservationSource: null,
    });

    expect(released).toBe(false);
  });
});
