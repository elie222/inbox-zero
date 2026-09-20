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
