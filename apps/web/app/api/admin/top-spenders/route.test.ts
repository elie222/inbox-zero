import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  getTopWeeklyUsageCosts,
  getWeeklyUsageCostWindow,
} from "@/utils/redis/usage";
import {
  getAdminAiModelSpendByPeriod,
  getAdminAiUserModelSpendByPeriod,
} from "@inboxzero/tinybird-ai-analytics";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithAdminTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAdminTestMiddleware();
});
vi.mock("@/utils/redis/usage", () => ({
  getTopWeeklyUsageCosts: vi.fn(),
  getWeeklyUsageCostWindow: vi.fn(),
}));
vi.mock("@inboxzero/tinybird-ai-analytics", () => ({
  getAdminAiModelSpendByPeriod: vi.fn(),
  getAdminAiUserModelSpendByPeriod: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: 2,
    NANO_LLMS: "openai:gpt-5.4-nano",
  },
}));

import { GET } from "./route";

describe("GET /api/admin/top-spenders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("maps legacy email-keyed weekly spend to the owning user", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-24T15:30:00.000Z"));

    vi.mocked(getTopWeeklyUsageCosts).mockResolvedValue([
      { email: "account@example.com", cost: 3 },
    ]);
    vi.mocked(getWeeklyUsageCostWindow).mockReturnValue({
      startTimestampMs: Date.UTC(2026, 1, 18),
      endTimestampMs: Date.UTC(2026, 1, 25),
    });
    vi.mocked(getAdminAiModelSpendByPeriod).mockResolvedValue([
      {
        provider: "openrouter",
        model: "openai/example-model",
        cost: 2.5,
        calls: 10,
      },
    ]);
    vi.mocked(getAdminAiUserModelSpendByPeriod).mockResolvedValue([
      {
        userId: "user-1",
        provider: "openrouter",
        model: "openai/example-model",
        cost: 1.25,
        calls: 5,
      },
    ]);
    prisma.emailAccount.findMany.mockResolvedValue([
      {
        id: "email-account-1",
        email: "account@example.com",
        userId: "user-1",
      },
    ] as any);
    prisma.user.findMany.mockResolvedValue([
      {
        id: "user-1",
        email: "user@example.com",
        aiApiKey: null,
        emailAccounts: [
          { id: "email-account-1", email: "account@example.com" },
        ],
      },
    ] as any);

    const response = await GET(
      new NextRequest("http://localhost:3000/api/admin/top-spenders"),
    );
    const data = await response.json();

    expect(prisma.emailAccount.findMany).toHaveBeenCalledWith({
      where: { email: { in: ["account@example.com"] } },
      select: { id: true, email: true, userId: true },
    });
    expect(getWeeklyUsageCostWindow).toHaveBeenCalledWith(
      new Date("2026-02-24T15:30:00.000Z"),
    );
    expect(getAdminAiModelSpendByPeriod).toHaveBeenCalledWith({
      startTimestampMs: Date.UTC(2026, 1, 18),
      endTimestampMs: Date.UTC(2026, 1, 25),
      limit: 25,
    });
    expect(getAdminAiUserModelSpendByPeriod).toHaveBeenCalledWith({
      userIds: ["user-1"],
      startTimestampMs: Date.UTC(2026, 1, 18),
      endTimestampMs: Date.UTC(2026, 1, 25),
      perUserLimit: 3,
    });
    expect(data.topSpenders).toEqual([
      {
        email: "account@example.com",
        cost: 3,
        emailAccountId: "email-account-1",
        userEmailAccountCount: 1,
        modelSpend: [
          {
            userId: "user-1",
            provider: "openrouter",
            model: "openai/example-model",
            cost: 1.25,
            calls: 5,
          },
        ],
        nanoLimitedBySpendGuard: true,
      },
    ]);
    expect(data.modelSpend).toEqual([
      {
        provider: "openrouter",
        model: "openai/example-model",
        cost: 2.5,
        calls: 10,
      },
    ]);
  });
});
