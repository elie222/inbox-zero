import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getTopWeeklyUsageCosts,
  getUsage,
  getWeeklyUsageCost,
  saveUsage,
} from "@/utils/redis/usage";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis", () => ({
  redis: {
    scan: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
    hgetall: vi.fn(),
    hincrby: vi.fn(),
    hincrbyfloat: vi.fn(),
    expire: vi.fn(),
  },
}));

describe("redis usage tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.scan).mockResolvedValue(["0", []]);
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.del).mockResolvedValue(1);
    vi.mocked(redis.hincrby).mockResolvedValue(1);
    vi.mocked(redis.hincrbyfloat).mockResolvedValue(1);
    vi.mocked(redis.expire).mockResolvedValue(1);
  });

  it("reads usage by email account ID", async () => {
    vi.mocked(redis.hgetall).mockResolvedValue({ openaiCalls: 3 });

    const usage = await getUsage({ emailAccountId: "email-account-1" });

    expect(usage).toEqual({ openaiCalls: 3 });
    expect(redis.hgetall).toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
    );
  });

  it("migrates legacy email usage into account and user usage before reading", async () => {
    const usageByKey: Record<string, { openaiCalls?: number; cost?: string }> =
      {
        "usage:user@example.com": { openaiCalls: 3, cost: "1.25" },
        "usage:email-account:email-account-1": { openaiCalls: 3 },
      };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => usageByKey[key] ?? {},
    );

    const usage = await getUsage({
      emailAccountId: "email-account-1",
      legacyEmail: "user@example.com",
      userId: "user-1",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:usage-email-account:email-account-1:lock",
      expect.any(String),
      { nx: true, ex: 300 },
    );
    expect(redis.hincrby).toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "openaiCalls",
      3,
    );
    expect(redis.hincrby).toHaveBeenCalledWith(
      "usage:user:user-1",
      "openaiCalls",
      3,
    );
    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "cost",
      1.25,
    );
    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:usage-email-account:email-account-1:done",
      expect.any(String),
    );
    expect(usage).toEqual({ openaiCalls: 3 });
  });

  it("includes legacy email usage while another request owns the migration lock", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);
    const usageByKey: Record<string, { openaiCalls?: number; cost?: string }> =
      {
        "usage:email-account:email-account-1": {
          openaiCalls: 2,
          cost: "0.75",
        },
        "usage:user@example.com": { openaiCalls: 3, cost: "1.25" },
      };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => usageByKey[key] ?? {},
    );

    const usage = await getUsage({
      emailAccountId: "email-account-1",
      legacyEmail: "user@example.com",
      userId: "user-1",
    });

    expect(usage).toEqual({ openaiCalls: 5, cost: 2 });
  });

  it("sums user usage cost across the last 7 days", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");
    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.5" },
      "usage-weekly-cost:user:user-1:2026-02-23": { cost: "0.5" },
      "usage-weekly-cost:user:user-1:2026-02-22": { cost: "0.25" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const weeklyCost = await getWeeklyUsageCost({ userId: "user-1", now });

    expect(weeklyCost).toBeCloseTo(2.25);
    expect(redis.hgetall).toHaveBeenCalledTimes(7);
    expect(redis.hgetall).not.toHaveBeenCalledWith(
      "usage-weekly-cost:user@example.com:2026-02-24",
    );
  });

  it("migrates legacy weekly email spend into user weekly spend", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");
    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user@example.com:2026-02-24": { cost: "1.5" },
      "usage-weekly-cost:user@example.com:2026-02-23": { cost: "0.5" },
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "2.0" },
      "usage-weekly-cost:user:user-1:2026-02-23": { cost: "0.5" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const weeklyCost = await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["user@example.com"],
      now,
    });

    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-24",
      "cost",
      1.5,
    );
    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-23",
      "cost",
      0.5,
    );
    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:weekly-usage-cost-user:user-1:done",
      expect.any(String),
    );
    expect(weeklyCost).toBeCloseTo(2.5);
  });

  it("includes legacy weekly spend while another request owns the migration lock", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);
    const now = new Date("2026-02-24T15:00:00.000Z");
    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "2.0" },
      "usage-weekly-cost:user@example.com:2026-02-24": { cost: "1.5" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const weeklyCost = await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["user@example.com"],
      now,
    });

    expect(weeklyCost).toBeCloseTo(3.5);
  });

  it("does not let a partial weekly migration marker hide another legacy email", async () => {
    let weeklyMigrationMarkedDone = false;
    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key === "usage-migration:weekly-usage-cost-user:user-1:done") {
        return weeklyMigrationMarkedDone ? "done" : null;
      }
      return null;
    });
    vi.mocked(redis.set).mockImplementation(async (key: string) => {
      if (key === "usage-migration:weekly-usage-cost-user:user-1:done") {
        weeklyMigrationMarkedDone = true;
      }
      return "OK";
    });

    const now = new Date("2026-02-24T15:00:00.000Z");
    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:primary@example.com:2026-02-24": { cost: "1.0" },
      "usage-weekly-cost:secondary@example.com:2026-02-24": { cost: "2.0" },
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.0" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["primary@example.com"],
      now,
    });

    const weeklyCost = await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["primary@example.com", "secondary@example.com"],
      now,
    });

    expect(weeklyCost).toBeCloseTo(3);
  });

  it("includes post-migration legacy weekly writes during rolling deploys", async () => {
    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key === "usage-migration:weekly-usage-cost-user:user-1:done") {
        return JSON.stringify({
          weeklyCosts: {
            "usage-weekly-cost:user@example.com:2026-02-24": 1,
          },
        });
      }
      return null;
    });

    const now = new Date("2026-02-24T15:00:00.000Z");
    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.0" },
      "usage-weekly-cost:user@example.com:2026-02-24": { cost: "1.5" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const weeklyCost = await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["user@example.com"],
      now,
    });

    expect(weeklyCost).toBeCloseTo(1.5);
  });

  it("does not persist post-migration legacy weekly writes without the migration lock", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");
    const legacyWeeklyCostKey = "usage-weekly-cost:user@example.com:2026-02-24";

    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key === "usage-migration:weekly-usage-cost-user:user-1:done") {
        return JSON.stringify({
          weeklyCosts: {
            [legacyWeeklyCostKey]: 1,
          },
        });
      }
      return null;
    });
    vi.mocked(redis.set).mockImplementation(async (key: string) => {
      if (key === "usage-migration:weekly-usage-cost-user:user-1:lock") {
        return null;
      }
      return "OK";
    });

    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.0" },
      [legacyWeeklyCostKey]: { cost: "1.5" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const weeklyCost = await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["user@example.com"],
      now,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:weekly-usage-cost-user:user-1:lock",
      expect.any(String),
      { nx: true, ex: 300 },
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-24",
      "cost",
      0.5,
    );
    expect(weeklyCost).toBeCloseTo(1.5);
  });

  it("uses the latest weekly migration marker after claiming the migration lock", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");
    const legacyWeeklyCostKey = "usage-weekly-cost:user@example.com:2026-02-24";
    let doneReads = 0;

    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key !== "usage-migration:weekly-usage-cost-user:user-1:done") {
        return null;
      }

      doneReads += 1;
      return JSON.stringify({
        weeklyCosts: {
          [legacyWeeklyCostKey]: doneReads === 1 ? 1 : 1.5,
        },
      });
    });

    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.5" },
      [legacyWeeklyCostKey]: { cost: "1.5" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const weeklyCost = await getWeeklyUsageCost({
      userId: "user-1",
      legacyEmails: ["user@example.com"],
      now,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:weekly-usage-cost-user:user-1:lock",
      expect.any(String),
      { nx: true, ex: 300 },
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-24",
      "cost",
      0.5,
    );
    expect(weeklyCost).toBeCloseTo(1.5);
  });

  it("returns top weekly spenders from user-keyed costs only", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    vi.mocked(redis.scan)
      .mockResolvedValueOnce([
        "1",
        [
          "usage-weekly-cost:user:user-1:2026-02-24",
          "usage-weekly-cost:user:user-2:2026-02-24",
          "usage-weekly-cost:user:user-1:2026-02-23",
          "usage-weekly-cost:legacy@example.com:2026-02-24",
        ],
      ])
      .mockResolvedValueOnce([
        "0",
        [
          "usage-weekly-cost:user:user-2:2026-02-22",
          "usage-weekly-cost:user:user-3:2026-02-10",
        ],
      ]);

    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.5" },
      "usage-weekly-cost:user:user-1:2026-02-23": { cost: "2.0" },
      "usage-weekly-cost:user:user-2:2026-02-24": { cost: "1.2" },
      "usage-weekly-cost:user:user-2:2026-02-22": { cost: "0.4" },
      "usage-weekly-cost:user:user-3:2026-02-10": { cost: "8.0" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const topSpenders = await getTopWeeklyUsageCosts({ limit: 2, now });

    expect(topSpenders).toEqual([
      { userId: "user-1", cost: 3.5 },
      { userId: "user-2", cost: 1.6 },
    ]);
    expect(redis.hgetall).toHaveBeenCalledTimes(5);
    expect(redis.hgetall).not.toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-3:2026-02-10",
    );
  });

  it("returns legacy weekly spenders before they have been migrated", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    vi.mocked(redis.scan).mockResolvedValueOnce([
      "0",
      [
        "usage-weekly-cost:user:user-1:2026-02-24",
        "usage-weekly-cost:legacy@example.com:2026-02-24",
      ],
    ]);

    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user:user-1:2026-02-24": { cost: "1.5" },
      "usage-weekly-cost:legacy@example.com:2026-02-24": { cost: "2.0" },
    };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => costsByKey[key] ?? {},
    );

    const topSpenders = await getTopWeeklyUsageCosts({ limit: 2, now });

    expect(topSpenders).toEqual([
      { email: "legacy@example.com", cost: 2.0 },
      { userId: "user-1", cost: 1.5 },
    ]);
  });

  it("stores usage under both email account and user keys", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    await saveUsage({
      userId: "user-1",
      emailAccountId: "email-account-1",
      usage: {
        totalTokens: 300,
        inputTokens: 200,
        outputTokens: 100,
      },
      cost: 1.25,
      now,
    });

    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "cost",
      1.25,
    );
    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage:user:user-1",
      "cost",
      1.25,
    );
    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-24",
      "cost",
      1.25,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-24",
      691_200,
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage:user@example.com",
      "cost",
      1.25,
    );
  });

  it("includes post-migration legacy usage writes during rolling deploys", async () => {
    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key === "usage-migration:usage-email-account:email-account-1:done") {
        return JSON.stringify({
          usage: {
            openaiCalls: 2,
            cost: 1,
          },
        });
      }
      return null;
    });

    const usageByKey: Record<string, { openaiCalls?: number; cost?: string }> =
      {
        "usage:email-account:email-account-1": {
          openaiCalls: 2,
          cost: "1.0",
        },
        "usage:user@example.com": { openaiCalls: 3, cost: "1.5" },
      };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => usageByKey[key] ?? {},
    );

    const usage = await getUsage({
      emailAccountId: "email-account-1",
      legacyEmail: "user@example.com",
      userId: "user-1",
    });

    expect(usage).toEqual({ openaiCalls: 3, cost: 1.5 });
  });

  it("does not persist post-migration legacy usage writes without the migration lock", async () => {
    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key === "usage-migration:usage-email-account:email-account-1:done") {
        return JSON.stringify({
          usage: {
            openaiCalls: 2,
            cost: 1,
          },
        });
      }
      return null;
    });
    vi.mocked(redis.set).mockImplementation(async (key: string) => {
      if (key === "usage-migration:usage-email-account:email-account-1:lock") {
        return null;
      }
      return "OK";
    });

    const usageByKey: Record<string, { openaiCalls?: number; cost?: string }> =
      {
        "usage:email-account:email-account-1": {
          openaiCalls: 2,
          cost: "1.0",
        },
        "usage:user@example.com": { openaiCalls: 3, cost: "1.5" },
      };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => usageByKey[key] ?? {},
    );

    const usage = await getUsage({
      emailAccountId: "email-account-1",
      legacyEmail: "user@example.com",
      userId: "user-1",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:usage-email-account:email-account-1:lock",
      expect.any(String),
      { nx: true, ex: 300 },
    );
    expect(redis.hincrby).not.toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "openaiCalls",
      1,
    );
    expect(redis.hincrby).not.toHaveBeenCalledWith(
      "usage:user:user-1",
      "openaiCalls",
      1,
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "cost",
      0.5,
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage:user:user-1",
      "cost",
      0.5,
    );
    expect(usage).toEqual({ openaiCalls: 3, cost: 1.5 });
  });

  it("uses the latest usage migration marker after claiming the migration lock", async () => {
    let doneReads = 0;

    vi.mocked(redis.get).mockImplementation(async (key: string) => {
      if (key !== "usage-migration:usage-email-account:email-account-1:done") {
        return null;
      }

      doneReads += 1;
      return JSON.stringify({
        usage: {
          openaiCalls: doneReads === 1 ? 2 : 3,
          cost: doneReads === 1 ? 1 : 1.5,
        },
      });
    });

    const usageByKey: Record<string, { openaiCalls?: number; cost?: string }> =
      {
        "usage:email-account:email-account-1": {
          openaiCalls: 3,
          cost: "1.5",
        },
        "usage:user@example.com": { openaiCalls: 3, cost: "1.5" },
      };

    vi.mocked(redis.hgetall).mockImplementation(
      async (key: string) => usageByKey[key] ?? {},
    );

    const usage = await getUsage({
      emailAccountId: "email-account-1",
      legacyEmail: "user@example.com",
      userId: "user-1",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "usage-migration:usage-email-account:email-account-1:lock",
      expect.any(String),
      { nx: true, ex: 300 },
    );
    expect(redis.hincrby).not.toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "openaiCalls",
      1,
    );
    expect(redis.hincrby).not.toHaveBeenCalledWith(
      "usage:user:user-1",
      "openaiCalls",
      1,
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "cost",
      0.5,
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage:user:user-1",
      "cost",
      0.5,
    );
    expect(usage).toEqual({ openaiCalls: 3, cost: 1.5 });
  });

  it("stores account usage without weekly spend when user ID is missing", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    await saveUsage({
      emailAccountId: "email-account-1",
      usage: {
        totalTokens: 300,
        inputTokens: 200,
        outputTokens: 100,
      },
      cost: 1.25,
      now,
    });

    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage:email-account:email-account-1",
      "cost",
      1.25,
    );
    expect(redis.hincrbyfloat).not.toHaveBeenCalledWith(
      "usage-weekly-cost:user:user-1:2026-02-24",
      "cost",
      1.25,
    );
    expect(redis.expire).not.toHaveBeenCalled();
  });

  it("skips cost updates when platform cost is zero", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    await saveUsage({
      userId: "user-1",
      emailAccountId: "email-account-1",
      usage: {
        totalTokens: 100,
      },
      cost: 0,
      now,
    });

    expect(redis.hincrbyfloat).not.toHaveBeenCalled();
    expect(redis.expire).not.toHaveBeenCalled();
  });
});
