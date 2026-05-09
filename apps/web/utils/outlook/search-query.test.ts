import { describe, expect, it } from "vitest";
import {
  matchesOutlookMetadataFilters,
  parseOutlookMetadataSearchQuery,
} from "@/utils/outlook/search-query";

describe("parseOutlookMetadataSearchQuery", () => {
  it("turns read state and structured category names into metadata filters", () => {
    const result = parseOutlookMetadataSearchQuery("unread", {
      categoryNames: ["Newsletter"],
    });

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

  it("keeps category-looking words as text search unless category is structured", () => {
    const result = parseOutlookMetadataSearchQuery("unread newsletters");

    expect(result).toEqual({
      searchQuery: "newsletters",
      filters: {
        isRead: false,
        categoryNames: [],
      },
      odataFilters: ["isRead eq false"],
    });
  });

  it("lets structured read state override query text", () => {
    const result = parseOutlookMetadataSearchQuery("unread newsletters", {
      readState: "read",
      categoryNames: ["Newsletter"],
    });

    expect(result).toEqual({
      searchQuery: "newsletters",
      filters: {
        isRead: true,
        categoryNames: ["Newsletter"],
      },
      odataFilters: [
        "isRead eq true",
        "categories/any(category: category eq 'Newsletter')",
      ],
    });
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
