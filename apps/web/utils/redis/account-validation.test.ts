import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({
  isRedisConfigured: vi.fn(),
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

import {
  getEmailAccount,
  invalidateAccountValidation,
} from "./account-validation";
import { isRedisConfigured, redis } from "@/utils/redis";

describe("account validation redis fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns cached email when redis is configured", async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(true);
    vi.mocked(redis.get).mockResolvedValue("cached@example.com");

    const result = await getEmailAccount({
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(result).toBe("cached@example.com");
    expect(prisma.emailAccount.findUnique).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("falls back to the database when redis is unavailable", async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);
    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "db@example.com",
    } as any);

    const result = await getEmailAccount({
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(result).toBe("db@example.com");
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("skips invalidation when redis is unavailable", async () => {
    vi.mocked(isRedisConfigured).mockReturnValue(false);

    await invalidateAccountValidation({
      userId: "user-1",
      emailAccountId: "account-1",
    });

    expect(redis.del).not.toHaveBeenCalled();
  });
});
