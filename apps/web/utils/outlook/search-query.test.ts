import { describe, expect, it } from "vitest";
import {
  matchesOutlookMetadataFilters,
  parseOutlookMetadataSearchQuery,
} from "@/utils/outlook/search-query";

describe("parseOutlookMetadataSearchQuery", () => {
  it("turns read state and exact category names into metadata filters", () => {
    const result = parseOutlookMetadataSearchQuery(
      "unread newsletters",
      new Map([["Newsletter", "category-newsletter"]]),
    );

    expect(result).toEqual({
      searchQuery: "",
      filters: {
        isRead: false,
        categoryNames: ["Newsletter"],
      },
      odataFilters: [
        "isRead eq false",
        "categories/any(category: category eq 'Newsletter')",
      ],
    });
  });

  it("keeps text search terms when they do not match known categories", () => {
    const result = parseOutlookMetadataSearchQuery(
      "unread sender@example.com",
      new Map([["Newsletter", "category-newsletter"]]),
    );

    expect(result).toEqual({
      searchQuery: "sender@example.com",
      filters: {
        isRead: false,
        categoryNames: [],
      },
      odataFilters: ["isRead eq false"],
    });
  });

  it("prefers exact category matches over plural aliases", () => {
    const result = parseOutlookMetadataSearchQuery(
      "receipts",
      new Map([
        ["Receipts", "category-receipts"],
        ["Receipt", "category-receipt"],
      ]),
    );

    expect(result.filters.categoryNames).toEqual(["Receipts"]);
    expect(result.odataFilters).toEqual([
      "categories/any(category: category eq 'Receipts')",
    ]);
  });

  it("recognizes grouped category field terms", () => {
    const result = parseOutlookMetadataSearchQuery(
      "unread (category:Newsletter)",
      new Map([["Newsletter", "category-newsletter"]]),
    );

    expect(result).toEqual({
      searchQuery: "",
      filters: {
        isRead: false,
        categoryNames: ["Newsletter"],
      },
      odataFilters: [
        "isRead eq false",
        "categories/any(category: category eq 'Newsletter')",
      ],
    });
  });

  it("supports label field aliases for categories", () => {
    const result = parseOutlookMetadataSearchQuery(
      'label:"To Reply"',
      new Map([["To Reply", "category-to-reply"]]),
    );

    expect(result.searchQuery).toBe("");
    expect(result.filters.categoryNames).toEqual(["To Reply"]);
  });
});

describe("matchesOutlookMetadataFilters", () => {
  it("requires all metadata filters to match", () => {
    expect(
      matchesOutlookMetadataFilters(
        { isRead: false, categories: ["Newsletter"] },
        { isRead: false, categoryNames: ["Newsletter"] },
      ),
    ).toBe(true);

    expect(
      matchesOutlookMetadataFilters(
        { isRead: false, categories: ["Receipt"] },
        { isRead: false, categoryNames: ["Newsletter"] },
      ),
    ).toBe(false);
  });
});
