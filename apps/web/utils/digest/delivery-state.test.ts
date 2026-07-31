import { beforeEach, describe, expect, it, vi } from "vitest";
import { DigestStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { getDigestDeliveryState } from "@/utils/digest/delivery-state";

vi.mock("@/utils/prisma");

describe("getDigestDeliveryState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns queued items and the latest successful delivery", async () => {
    const sentAt = new Date("2026-01-10T15:25:00.000Z");
    vi.mocked(prisma.digestItem.count).mockResolvedValue(3);
    vi.mocked(prisma.digest.findFirst).mockResolvedValue({
      status: DigestStatus.SENT,
      sentAt,
      updatedAt: sentAt,
    } as never);

    await expect(
      getDigestDeliveryState({ emailAccountId: "account-1" }),
    ).resolves.toEqual({
      queuedItemCount: 3,
      lastDelivery: {
        status: DigestStatus.SENT,
        occurredAt: sentAt,
      },
    });

    expect(prisma.digestItem.count).toHaveBeenCalledWith({
      where: {
        digest: {
          emailAccountId: "account-1",
          status: {
            in: [DigestStatus.PENDING, DigestStatus.PROCESSING],
          },
        },
      },
    });
    expect(prisma.digest.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        status: {
          in: [DigestStatus.SENT, DigestStatus.FAILED],
        },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        status: true,
        sentAt: true,
        updatedAt: true,
      },
    });
  });

  it("uses the attempt time for a failed delivery", async () => {
    const failedAt = new Date("2026-01-10T15:26:00.000Z");
    vi.mocked(prisma.digestItem.count).mockResolvedValue(0);
    vi.mocked(prisma.digest.findFirst).mockResolvedValue({
      status: DigestStatus.FAILED,
      sentAt: null,
      updatedAt: failedAt,
    } as never);

    await expect(
      getDigestDeliveryState({ emailAccountId: "account-1" }),
    ).resolves.toEqual({
      queuedItemCount: 0,
      lastDelivery: {
        status: DigestStatus.FAILED,
        occurredAt: failedAt,
      },
    });
  });

  it("returns no last delivery before the first attempt", async () => {
    vi.mocked(prisma.digestItem.count).mockResolvedValue(0);
    vi.mocked(prisma.digest.findFirst).mockResolvedValue(null);

    await expect(
      getDigestDeliveryState({ emailAccountId: "account-1" }),
    ).resolves.toEqual({
      queuedItemCount: 0,
      lastDelivery: null,
    });
  });
});
