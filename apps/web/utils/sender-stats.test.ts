import { beforeEach, describe, expect, it, vi } from "vitest";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/__mocks__/prisma";
import { getSenderEmailStats } from "./sender-stats";

vi.mock("@/utils/prisma");

function senderRow({
  from,
  count,
  lastEmailAt = BigInt("1700000000000"),
}: {
  from: string;
  count: number;
  lastEmailAt?: bigint | null;
}) {
  return {
    from,
    fromName: "News",
    minFromName: "News",
    count,
    inboxEmails: 1,
    readEmails: 0,
    unsubscribeLink: null,
    lastEmailAt,
  };
}

function sentSql() {
  const query = vi.mocked(prisma.$queryRaw).mock.calls.at(-1)?.[0] as {
    strings: string[];
    values: unknown[];
  };
  return {
    text: query.strings.join("?"),
    values: query.values,
  };
}

describe("getSenderEmailStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a limit below 1", async () => {
    await expect(
      getSenderEmailStats({ emailAccountId: "account-1", limit: 0 }),
    ).rejects.toBeInstanceOf(SafeError);
    await expect(
      getSenderEmailStats({ emailAccountId: "account-1", limit: -5 }),
    ).rejects.toBeInstanceOf(SafeError);
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns every sender and no cursor when limit is omitted", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      senderRow({ from: "a@example.com", count: 2 }),
      senderRow({ from: "b@example.com", count: 1 }),
    ] as never);

    const page = await getSenderEmailStats({
      emailAccountId: "account-1",
    });

    expect(page.nextCursor).toBeNull();
    expect(page.senders.map((sender) => sender.from)).toEqual([
      "a@example.com",
      "b@example.com",
    ]);
    expect(sentSql().text).not.toContain("LIMIT");
    expect(page.senders[0]?.lastEmailAt).toBe(1_700_000_000_000);
  });

  it("pages with an opaque cursor and keeps the cursor values out of the SQL text", async () => {
    const maliciousFrom = "news@example.com' OR 1=1 --";
    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([
      senderRow({ from: "a@example.com", count: 3 }),
      senderRow({ from: maliciousFrom, count: 2 }),
      senderRow({ from: "c@example.com", count: 1 }),
    ] as never);

    const firstPage = await getSenderEmailStats({
      emailAccountId: "account-1",
      limit: 2,
    });

    expect(firstPage.senders).toHaveLength(2);
    expect(firstPage.nextCursor).toEqual(expect.any(String));
    expect(sentSql().text).toContain("LIMIT 3");

    vi.mocked(prisma.$queryRaw).mockResolvedValueOnce([] as never);
    await getSenderEmailStats({
      emailAccountId: "account-1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });

    const nextPage = sentSql();
    expect(nextPage.text).not.toContain(maliciousFrom);
    expect(nextPage.values).toContain(maliciousFrom);
    expect(nextPage.values).toContain(2);
    expect(nextPage.text).toContain(`"count" <`);
  });

  it("sorts newest by last received time", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([] as never);

    await getSenderEmailStats({
      emailAccountId: "account-1",
      orderBy: "newest",
    });

    expect(sentSql().text).toContain(
      `"lastEmailAt" DESC NULLS LAST, "from" ASC`,
    );
  });

  it("rejects a cursor that does not match the requested sort", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([
      senderRow({ from: "a@example.com", count: 2 }),
      senderRow({ from: "b@example.com", count: 1 }),
    ] as never);

    const page = await getSenderEmailStats({
      emailAccountId: "account-1",
      limit: 1,
      orderBy: "emails",
    });

    await expect(
      getSenderEmailStats({
        emailAccountId: "account-1",
        limit: 1,
        orderBy: "newest",
        cursor: page.nextCursor,
      }),
    ).rejects.toBeInstanceOf(SafeError);
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects a malformed cursor", async () => {
    await expect(
      getSenderEmailStats({
        emailAccountId: "account-1",
        cursor: "not-a-cursor",
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      safeMessage: "Invalid cursor",
    });
  });

  it("propagates query failures", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error("stats failed"));

    await expect(
      getSenderEmailStats({
        emailAccountId: "account-1",
      }),
    ).rejects.toThrow("stats failed");
  });
});
