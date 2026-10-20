import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getNoAddressPile } from "@/utils/no-address-pile";

vi.mock("@/utils/prisma");

describe("getNoAddressPile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only selects address-less mail from threads the user never sent in", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

    await getNoAddressPile({ emailAccountId: "account-1" });

    const query = vi.mocked(prisma.$queryRaw).mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    const text = query.strings.join("?");
    expect(text).toContain(`"from" = ''`);
    expect(text).toContain("NOT EXISTS");
    expect(text).toContain(`"reply"."threadId" = "EmailMessage"."threadId"`);
    expect(text).toContain(`"reply"."sent" = true`);
    expect(query.values).toEqual(["account-1", "account-1"]);
  });

  it("groups by display name with email counts and the threads to act on", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      { name: "Casino Bonus Hub", threadId: "t1", messageId: "m1" },
      { name: "Casino Bonus Hub", threadId: "t1", messageId: "m2" },
      { name: "Casino Bonus Hub", threadId: "t2", messageId: "m3" },
      { name: "Norton Renewal Center", threadId: "t3", messageId: "m4" },
      { name: "", threadId: "t4", messageId: "m5" },
    ]);

    const pile = await getNoAddressPile({ emailAccountId: "account-1" });

    expect(pile.total).toBe(5);
    expect(pile.names).toEqual([
      {
        name: "Casino Bonus Hub",
        count: 3,
        threads: [
          { threadId: "t1", messageIds: ["m1", "m2"] },
          { threadId: "t2", messageIds: ["m3"] },
        ],
      },
      {
        name: "",
        count: 1,
        threads: [{ threadId: "t4", messageIds: ["m5"] }],
      },
      {
        name: "Norton Renewal Center",
        count: 1,
        threads: [{ threadId: "t3", messageIds: ["m4"] }],
      },
    ]);
  });
});
