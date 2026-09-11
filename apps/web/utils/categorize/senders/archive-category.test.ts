import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { archiveCategory } from "./archive-category";

vi.mock("@/utils/prisma");

const logger = createTestLogger();

describe("archiveCategory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves a category by id and archives deduped sender emails", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-1",
      name: "Newsletters",
    } as never);
    prisma.newsletter.findMany.mockResolvedValue([
      { email: "First@example.com" },
      { email: "first@example.com" },
      { email: " Second@example.com " },
    ] as never);

    const bulkArchiveFromSenders = vi.fn().mockResolvedValue(undefined);

    const result = await archiveCategory({
      email: "owner@example.com",
      emailAccountId: "account-1",
      emailProvider: { bulkArchiveFromSenders } as never,
      logger,
      categoryId: "cat-1",
    });

    expect(bulkArchiveFromSenders).toHaveBeenCalledWith(
      ["first@example.com", "second@example.com"],
      "owner@example.com",
      "account-1",
    );
    expect(result).toEqual({
      success: true,
      action: "archive_category",
      category: {
        id: "cat-1",
        name: "Newsletters",
      },
      sendersCount: 2,
      senders: ["first@example.com", "second@example.com"],
      message: 'Archived mail from 2 senders in "Newsletters".',
    });
  });

  it("resolves a category by exact case-insensitive name", async () => {
    prisma.category.findFirst.mockResolvedValue({
      id: "cat-1",
      name: "Newsletters",
    } as never);
    prisma.newsletter.findMany.mockResolvedValue([
      { email: "sender@example.com" },
    ] as never);

    const bulkArchiveFromSenders = vi.fn().mockResolvedValue(undefined);

    const result = await archiveCategory({
      email: "owner@example.com",
      emailAccountId: "account-1",
      emailProvider: { bulkArchiveFromSenders } as never,
      logger,
      categoryName: "newsletters",
    });

    expect(prisma.category.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "account-1",
        name: {
          equals: "newsletters",
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
      },
    });
    expect(result).toMatchObject({
      success: true,
      category: {
        id: "cat-1",
        name: "Newsletters",
      },
    });
  });

  it("returns a descriptive no-op result for an empty Uncategorized bucket", async () => {
    prisma.newsletter.findMany.mockResolvedValue([] as never);

    const bulkArchiveFromSenders = vi.fn().mockResolvedValue(undefined);

    const result = await archiveCategory({
      email: "owner@example.com",
      emailAccountId: "account-1",
      emailProvider: { bulkArchiveFromSenders } as never,
      logger,
      categoryName: "Uncategorized",
    });

    expect(bulkArchiveFromSenders).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      action: "archive_category",
      category: {
        id: null,
        name: "Uncategorized",
      },
      sendersCount: 0,
      senders: [],
      message: 'No senders are currently assigned to "Uncategorized".',
    });
  });

  it("returns a descriptive error when the category does not exist", async () => {
    prisma.category.findFirst.mockResolvedValue(null);
    prisma.category.findMany.mockResolvedValue([
      { name: "Newsletters" },
      { name: "Receipts" },
    ] as never);

    const result = await archiveCategory({
      email: "owner@example.com",
      emailAccountId: "account-1",
      emailProvider: { bulkArchiveFromSenders: vi.fn() } as never,
      logger,
      categoryName: "Unknown",
    });

    expect(result).toEqual({
      success: false,
      action: "archive_category",
      message:
        'Category "Unknown" was not found. Available categories: Newsletters, Receipts, Uncategorized.',
    });
  });
});
