import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { deleteExpiredOtpPushNotifications } from "./otp-push-retention";

vi.mock("@/utils/prisma");

describe("deleteExpiredOtpPushNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes notification claims older than 24 hours", async () => {
    prisma.otpPushNotification.deleteMany.mockResolvedValue({ count: 3 });

    await expect(
      deleteExpiredOtpPushNotifications(new Date("2026-07-31T12:00:00.000Z")),
    ).resolves.toBe(3);
    expect(prisma.otpPushNotification.deleteMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          lt: new Date("2026-07-30T12:00:00.000Z"),
        },
      },
    });
  });
});
