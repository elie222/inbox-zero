import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getSenderMessageCounts } from "./get-sender-message-counts";

vi.mock("@/utils/prisma");

describe("getSenderMessageCounts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keys the counts by lowercase sender address", async () => {
    prisma.$queryRaw.mockResolvedValue([
      {
        sender: "deals@shop.example",
        inbox: 3,
        unread: 2,
        read: 1,
        total: 4,
      },
    ] as never);

    const counts = await getSenderMessageCounts({ emailAccountId: "acc-1" });

    expect(counts.get("deals@shop.example")).toEqual({
      inbox: 3,
      unread: 2,
      read: 1,
      total: 4,
    });
    expect(counts.get("Deals@shop.example")).toBeUndefined();
  });

  it("scopes the query to the email account", async () => {
    prisma.$queryRaw.mockResolvedValue([] as never);

    await getSenderMessageCounts({ emailAccountId: "acc-1" });

    const [, ...values] = prisma.$queryRaw.mock.calls[0] as unknown[];
    expect(values).toEqual(["acc-1"]);
  });
});
