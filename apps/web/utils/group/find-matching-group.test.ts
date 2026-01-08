import { describe, expect, it } from "vitest";
import { findMatchingGroupItem } from "./find-matching-group";
import { GroupItemType } from "@/generated/prisma/enums";

// Run with:
// pnpm test utils/group/find-matching-group.test.ts

describe("findMatchingGroupItem", () => {
  it("should match FROM rules", () => {
    const groupItems = [
      {
        type: GroupItemType.FROM,
        value: "newsletter@company.com",
        exclude: false,
      },
      { type: GroupItemType.FROM, value: "@company.com", exclude: false },
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
      { type: GroupItemType.SUBJECT, value: "Invoice", exclude: false },
      { type: GroupItemType.SUBJECT, value: "[GitHub]", exclude: false },
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
      { type: GroupItemType.FROM, value: "test@example.com", exclude: false },
      { type: GroupItemType.SUBJECT, value: "Test", exclude: false },
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
      { type: GroupItemType.SUBJECT, value: "Invoice", exclude: false },
      { type: GroupItemType.SUBJECT, value: "Company", exclude: false },
    ];

    // Should return first matching rule even though both would match
    expect(
      findMatchingGroupItem(
        { from: "", subject: "Invoice from Company" },
        groupItems,
      ),
    ).toBe(groupItems[0]);
  });

  it("should match FROM rules case-insensitively", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "@Acme-Corp.com", exclude: false },
    ];

    // Lowercase email should match mixed-case pattern
    expect(
      findMatchingGroupItem(
        { from: "billing@acme-corp.com", subject: "" },
        groupItems,
      ),
    ).toBe(groupItems[0]);

    // Uppercase email should match mixed-case pattern
    expect(
      findMatchingGroupItem(
        { from: "BILLING@ACME-CORP.COM", subject: "" },
        groupItems,
      ),
    ).toBe(groupItems[0]);
  });

  it("should match SUBJECT rules case-insensitively", () => {
    const groupItems = [
      { type: GroupItemType.SUBJECT, value: "Invoice", exclude: false },
    ];

    // Lowercase subject should match capitalized pattern
    expect(
      findMatchingGroupItem(
        { from: "", subject: "invoice #12345" },
        groupItems,
      ),
    ).toBe(groupItems[0]);

    // Uppercase subject should match capitalized pattern
    expect(
      findMatchingGroupItem(
        { from: "", subject: "INVOICE #12345" },
        groupItems,
      ),
    ).toBe(groupItems[0]);
  });
});
