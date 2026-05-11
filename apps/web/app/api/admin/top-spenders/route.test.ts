import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getTopWeeklyUsageCosts } from "@/utils/redis/usage";

vi.mock("@/utils/prisma");
vi.mock("@/utils/middleware", async () => {
  const { createWithAdminTestMiddleware } = await vi.importActual<
    typeof import("@/__tests__/helpers")
  >("@/__tests__/helpers");

  return createWithAdminTestMiddleware();
});
vi.mock("@/utils/redis/usage", () => ({
  getTopWeeklyUsageCosts: vi.fn(),
}));
vi.mock("@/env", () => ({
  env: {
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: 2,
    NANO_LLM_PROVIDER: "openai",
    NANO_LLM_MODEL: "gpt-5-nano",
  },
}));

import { GET } from "./route";

describe("GET /api/admin/top-spenders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps legacy email-keyed weekly spend to the owning user", async () => {
    vi.mocked(getTopWeeklyUsageCosts).mockResolvedValue([
      { email: "account@example.com", cost: 3 },
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
    expect(data.topSpenders).toEqual([
      {
        email: "account@example.com",
        cost: 3,
        emailAccountId: "email-account-1",
        userEmailAccountCount: 1,
        nanoLimitedBySpendGuard: true,
      },
    ]);
  });
});
