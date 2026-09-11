import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { deleteExpiredMobilePushDeliveries } from "./mobile-push-retention";

vi.mock("@/utils/prisma");

describe("deleteExpiredMobilePushDeliveries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes delivery claims older than 24 hours", async () => {
    prisma.mobilePushDelivery.deleteMany.mockResolvedValue({ count: 3 });

    await expect(
      deleteExpiredMobilePushDeliveries(new Date("2026-07-31T12:00:00.000Z")),
    ).resolves.toBe(3);
    expect(prisma.mobilePushDelivery.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date("2026-07-30T12:00:00.000Z"),
        },
      },
    });
  });
});
