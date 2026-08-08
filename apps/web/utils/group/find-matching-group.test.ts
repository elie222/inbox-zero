import { describe, expect, it } from "vitest";
import { findMatchingGroupItem } from "./find-matching-group";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";

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

    expectMatchResults(groupItems, [
      {
        email: { from: "newsletter@company.com", subject: "" },
        expected: groupItems[0],
      },
      {
        email: { from: "support@company.com", subject: "" },
        expected: groupItems[1],
      },
      {
        email: { from: "someone@other.com", subject: "" },
        expected: undefined,
      },
    ]);
  });

  it("should match SUBJECT rules", () => {
    const groupItems = [
      { type: GroupItemType.SUBJECT, value: "Invoice", exclude: false },
      { type: GroupItemType.SUBJECT, value: "[GitHub]", exclude: false },
    ];

    expectMatchResults(groupItems, [
      {
        email: { from: "", subject: "Invoice #123" },
        expected: groupItems[0],
      },
      {
        email: { from: "", subject: "Invoice INV-2023-001 from Company" },
        expected: groupItems[0],
      },
      {
        email: { from: "", subject: "[GitHub] PR #456: Fix bug" },
        expected: groupItems[1],
      },
      {
        email: { from: "", subject: "Welcome to our service" },
        expected: undefined,
      },
    ]);
  });

  it("should handle empty inputs", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "test@example.com", exclude: false },
      { type: GroupItemType.SUBJECT, value: "Test", exclude: false },
    ];

    expectMatchResults(groupItems, [
      { email: { from: "", subject: "" }, expected: undefined },
      {
        email: { from: "test@example.com", subject: "" },
        expected: groupItems[0],
      },
    ]);
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

    expectMatchResults(groupItems, [
      {
        email: { from: "billing@acme-corp.com", subject: "" },
        expected: groupItems[0],
      },
      {
        email: { from: "BILLING@ACME-CORP.COM", subject: "" },
        expected: groupItems[0],
      },
    ]);
  });

  it("should match SUBJECT rules case-insensitively", () => {
    const groupItems = [
      { type: GroupItemType.SUBJECT, value: "Invoice", exclude: false },
    ];

    expectMatchResults(groupItems, [
      {
        email: { from: "", subject: "invoice #12345" },
        expected: groupItems[0],
      },
      {
        email: { from: "", subject: "INVOICE #12345" },
        expected: groupItems[0],
      },
    ]);
  });

  it("prefers explicit user evidence over an automatic exclusion", () => {
    const automaticExclusion = {
      type: GroupItemType.FROM,
      value: "@example.com",
      exclude: true,
      source: GroupItemSource.LABEL_REMOVED,
      updatedAt: new Date("2026-07-28T12:00:00Z"),
    };
    const userInclusion = {
      type: GroupItemType.FROM,
      value: "sender@example.com",
      exclude: false,
      source: GroupItemSource.USER,
      updatedAt: new Date("2026-07-01T12:00:00Z"),
    };

    expect(
      findMatchingGroupItem({ from: "sender@example.com", subject: "" }, [
        automaticExclusion,
        userInclusion,
      ]),
    ).toBe(userInclusion);
  });

  it("uses the newest automatic evidence when inclusion and exclusion overlap", () => {
    const olderExclusion = {
      type: GroupItemType.FROM,
      value: "@example.com",
      exclude: true,
      source: GroupItemSource.LABEL_REMOVED,
      updatedAt: new Date("2026-07-01T12:00:00Z"),
    };
    const newerInclusion = {
      type: GroupItemType.FROM,
      value: "sender@example.com",
      exclude: false,
      source: GroupItemSource.AI,
      updatedAt: new Date("2026-07-28T12:00:00Z"),
    };

    expect(
      findMatchingGroupItem({ from: "sender@example.com", subject: "" }, [
        olderExclusion,
        newerInclusion,
      ]),
    ).toBe(newerInclusion);
  });

  it("uses a newer automatic exclusion over an older automatic inclusion", () => {
    const olderInclusion = {
      type: GroupItemType.FROM,
      value: "sender@example.com",
      exclude: false,
      source: GroupItemSource.AI,
      updatedAt: new Date("2026-07-01T12:00:00Z"),
    };
    const newerExclusion = {
      type: GroupItemType.FROM,
      value: "@example.com",
      exclude: true,
      source: GroupItemSource.LABEL_REMOVED,
      updatedAt: new Date("2026-07-28T12:00:00Z"),
    };

    expect(
      findMatchingGroupItem({ from: "sender@example.com", subject: "" }, [
        olderInclusion,
        newerExclusion,
      ]),
    ).toBeNull();
  });

  it("keeps an explicit user exclusion ahead of newer automatic evidence", () => {
    const userExclusion = {
      type: GroupItemType.FROM,
      value: "sender@example.com",
      exclude: true,
      source: GroupItemSource.USER,
      updatedAt: new Date("2026-07-01T12:00:00Z"),
    };
    const automaticInclusion = {
      type: GroupItemType.FROM,
      value: "@example.com",
      exclude: false,
      source: GroupItemSource.AI,
      updatedAt: new Date("2026-07-28T12:00:00Z"),
    };

    expect(
      findMatchingGroupItem({ from: "sender@example.com", subject: "" }, [
        automaticInclusion,
        userExclusion,
      ]),
    ).toBeNull();
  });
});

function expectMatchResults(
  groupItems: Array<{
    type: GroupItemType;
    value: string;
    exclude: boolean;
  }>,
  cases: Array<{
    email: { from: string; subject: string };
    expected?: (typeof groupItems)[number];
  }>,
) {
  for (const { email, expected } of cases) {
    expect(findMatchingGroupItem(email, groupItems)).toBe(expected);
  }
}
