import { describe, expect, it } from "vitest";
import { findMatchingGroupItem } from "./find-matching-group";
import { GroupItemType } from "@prisma/client";

// Run with:
// pnpm test utils/group/find-matching-group.test.ts

describe("findMatchingGroupItem", () => {
  it("should match FROM rules", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "newsletter@company.com" },
      { type: GroupItemType.FROM, value: "@company.com" },
    ];

    // Full email match
    expect(
      findMatchingGroupItem(
        { from: "newsletter@company.com", subject: "" },
        groupItems,
      ),
    ).toBe(groupItems[0]);

    // Partial domain match
    expect(
      findMatchingGroupItem(
        { from: "support@company.com", subject: "" },
        groupItems,
      ),
    ).toBe(groupItems[1]);

    // No match
    expect(
      findMatchingGroupItem(
        { from: "someone@other.com", subject: "" },
        groupItems,
      ),
    ).toBeUndefined();
  });

  it("should match SUBJECT rules", () => {
    const groupItems = [
      { type: GroupItemType.SUBJECT, value: "Invoice" },
      { type: GroupItemType.SUBJECT, value: "[GitHub]" },
    ];

    // Exact subject match
    expect(
      findMatchingGroupItem({ from: "", subject: "Invoice #123" }, groupItems),
    ).toBe(groupItems[0]);

    // Match after number removal
    expect(
      findMatchingGroupItem(
        { from: "", subject: "Invoice INV-2023-001 from Company" },
        groupItems,
      ),
    ).toBe(groupItems[0]);

    // GitHub notification match
    expect(
      findMatchingGroupItem(
        { from: "", subject: "[GitHub] PR #456: Fix bug" },
        groupItems,
      ),
    ).toBe(groupItems[1]);

    // No match
    expect(
      findMatchingGroupItem(
        { from: "", subject: "Welcome to our service" },
        groupItems,
      ),
    ).toBeUndefined();
  });

  it("should handle empty inputs", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "test@example.com" },
      { type: GroupItemType.SUBJECT, value: "Test" },
    ];

    expect(
      findMatchingGroupItem({ from: "", subject: "" }, groupItems),
    ).toBeUndefined();

    expect(
      findMatchingGroupItem(
        { from: "test@example.com", subject: "" },
        groupItems,
      ),
    ).toBe(groupItems[0]);
  });

  it("should prioritize first matching rule", () => {
    const groupItems = [
      { type: GroupItemType.SUBJECT, value: "Invoice" },
      { type: GroupItemType.SUBJECT, value: "Company" },
    ];

    // Should return first matching rule even though both would match
    expect(
      findMatchingGroupItem(
        { from: "", subject: "Invoice from Company" },
        groupItems,
      ),
    ).toBe(groupItems[0]);
  });
});
