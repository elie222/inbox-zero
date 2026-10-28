import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { getUncategorizedSenders } from "./get-uncategorized-senders";

vi.mock("@/utils/prisma");

const { mockGetSenders } = vi.hoisted(() => ({
  mockGetSenders: vi.fn(),
}));

vi.mock("./get-senders", () => ({
  getSenders: (...args: Parameters<typeof mockGetSenders>) =>
    mockGetSenders(...args),
}));

describe("getUncategorizedSenders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.newsletter.findMany.mockResolvedValue([]);
  });

  it("returns uncategorized senders with their names", async () => {
    mockGetSenders.mockResolvedValue([
      { from: "new@example.com", fromName: "New Sender" },
    ]);

    const result = await getUncategorizedSenders({
      emailAccountId: "account-1",
    });

    expect(result.uncategorizedSenders).toEqual([
      { email: "new@example.com", name: "New Sender" },
    ]);
  });

  it("skips senders whose from header has no parseable email address", async () => {
    mockGetSenders.mockResolvedValue([
      { from: "", fromName: "KE Camps" },
      { from: "not an email", fromName: "Broken" },
      { from: "valid@example.com", fromName: "Valid" },
    ]);

    const result = await getUncategorizedSenders({
      emailAccountId: "account-1",
    });

    expect(result.uncategorizedSenders).toEqual([
      { email: "valid@example.com", name: "Valid" },
    ]);
  });

  it("dedupes case variants of the same sender into one entry", async () => {
    mockGetSenders.mockResolvedValue([
      { from: "Sender@example.com", fromName: null },
      { from: "sender@example.com", fromName: "Sender" },
    ]);

    const result = await getUncategorizedSenders({
      emailAccountId: "account-1",
    });

    expect(result.uncategorizedSenders).toEqual([
      { email: "sender@example.com", name: "Sender" },
    ]);
  });

  it("returns senders when paging starts past the first 200 senders", async () => {
    mockSenderPages(350);

    const result = await getUncategorizedSenders({
      emailAccountId: "account-1",
      offset: 200,
    });

    expect(result.uncategorizedSenders).toHaveLength(100);
    expect(result.uncategorizedSenders[0]?.email).toBe("sender200@example.com");
    expect(result.nextOffset).toBe(300);
  });

  it("keeps scanning past 200 senders when earlier pages are all categorized", async () => {
    mockSenderPages(350);
    prisma.newsletter.findMany.mockImplementation((async (args: {
      where: { email: { in: string[] } };
    }) =>
      args.where.email.in
        .filter((email) => Number(email.match(/\d+/)?.[0]) < 300)
        .map((email) => ({ email }))) as never);

    const result = await getUncategorizedSenders({
      emailAccountId: "account-1",
    });

    expect(result.uncategorizedSenders).toHaveLength(50);
    expect(result.uncategorizedSenders[0]?.email).toBe("sender300@example.com");
  });

  it("treats mixed-case senders as categorized when a canonicalized record exists", async () => {
    mockGetSenders.mockResolvedValue([
      { from: "Costco@digital.costco.com", fromName: "Costco" },
      { from: "new@example.com", fromName: "New Sender" },
    ]);
    prisma.newsletter.findMany.mockResolvedValue([
      { email: "costco@digital.costco.com" },
    ] as never);

    const result = await getUncategorizedSenders({
      emailAccountId: "account-1",
    });

    expect(result.uncategorizedSenders).toEqual([
      { email: "new@example.com", name: "New Sender" },
    ]);
    expect(prisma.newsletter.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          email: expect.objectContaining({ mode: "insensitive" }),
        }),
      }),
    );
  });
});

function mockSenderPages(total: number) {
  mockGetSenders.mockImplementation(
    async ({ offset = 0, limit = 100 }: { offset?: number; limit?: number }) =>
      Array.from(
        { length: Math.max(0, Math.min(limit, total - offset)) },
        (_, i) => ({
          from: `sender${offset + i}@example.com`,
          fromName: null,
        }),
      ),
  );
}
