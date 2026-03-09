import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getTopWeeklyUsageCosts,
  getWeeklyUsageCost,
  saveUsage,
} from "@/utils/redis/usage";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis", () => ({
  redis: {
    scan: vi.fn(),
    hgetall: vi.fn(),
    hincrby: vi.fn(),
    hincrbyfloat: vi.fn(),
    expire: vi.fn(),
  },
}));

describe("redis usage weekly cost tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redis.scan).mockResolvedValue(["0", []]);
    vi.mocked(redis.hincrby).mockResolvedValue(1);
    vi.mocked(redis.hincrbyfloat).mockResolvedValue(1);
    vi.mocked(redis.expire).mockResolvedValue(1);
  });

  it("sums usage cost across the last 7 days", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");
    const email = "user@example.com";
    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:user@example.com:2026-02-24": { cost: "1.5" },
      "usage-weekly-cost:user@example.com:2026-02-23": { cost: "0.5" },
      "usage-weekly-cost:user@example.com:2026-02-22": { cost: "0.25" },
    };

    vi.mocked(redis.hgetall).mockImplementation(async (key: string) => {
      return costsByKey[key] ?? {};
    });

    const weeklyCost = await getWeeklyUsageCost({ email, now });

    expect(weeklyCost).toBeCloseTo(2.25);
    expect(redis.hgetall).toHaveBeenCalledTimes(7);
  });

  it("returns top weekly spenders ordered by cost", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    vi.mocked(redis.scan)
      .mockResolvedValueOnce([
        "1",
        [
          "usage-weekly-cost:alice@example.com:2026-02-24",
          "usage-weekly-cost:bob@example.com:2026-02-24",
          "usage-weekly-cost:alice@example.com:2026-02-23",
        ],
      ])
      .mockResolvedValueOnce([
        "0",
        [
          "usage-weekly-cost:bob@example.com:2026-02-22",
          "usage-weekly-cost:carol@example.com:2026-02-10",
        ],
      ]);

    const costsByKey: Record<string, { cost?: string }> = {
      "usage-weekly-cost:alice@example.com:2026-02-24": { cost: "1.5" },
      "usage-weekly-cost:alice@example.com:2026-02-23": { cost: "2.0" },
      "usage-weekly-cost:bob@example.com:2026-02-24": { cost: "1.2" },
      "usage-weekly-cost:bob@example.com:2026-02-22": { cost: "0.4" },
      "usage-weekly-cost:carol@example.com:2026-02-10": { cost: "8.0" },
    };

    vi.mocked(redis.hgetall).mockImplementation(async (key: string) => {
      return costsByKey[key] ?? {};
    });

    const topSpenders = await getTopWeeklyUsageCosts({ limit: 2, now });

    expect(topSpenders).toEqual([
      { email: "alice@example.com", cost: 3.5 },
      { email: "bob@example.com", cost: 1.6 },
    ]);
    expect(redis.hgetall).toHaveBeenCalledTimes(4);
    expect(redis.hgetall).not.toHaveBeenCalledWith(
      "usage-weekly-cost:carol@example.com:2026-02-10",
    );
  });

  it("stores daily usage cost when platform cost is greater than zero", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");
    const email = "user@example.com";

    await saveUsage({
      email,
      usage: {
        totalTokens: 300,
        inputTokens: 200,
        outputTokens: 100,
      },
      cost: 1.25,
      now,
    });

    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage:user@example.com",
      "cost",
      1.25,
    );
    expect(redis.hincrbyfloat).toHaveBeenCalledWith(
      "usage-weekly-cost:user@example.com:2026-02-24",
      "cost",
      1.25,
    );
    expect(redis.expire).toHaveBeenCalledWith(
      "usage-weekly-cost:user@example.com:2026-02-24",
      691_200,
    );
  });

  it("skips daily cost updates when platform cost is zero", async () => {
    const now = new Date("2026-02-24T15:00:00.000Z");

    await saveUsage({
      email: "user@example.com",
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
