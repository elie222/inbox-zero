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

  it("matches a learned address only on the whole sender address", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "ann@acme.com", exclude: false },
    ];

    expectMatchResults(groupItems, [
      {
        email: { from: "Ann <Ann@Acme.com>", subject: "" },
        expected: groupItems[0],
      },
      // A longer local part or a domain suffix is a different sender.
      {
        email: { from: '"Jo" <joann@acme.com>', subject: "" },
        expected: undefined,
      },
      {
        email: { from: "ann@acme.com.evil.io", subject: "" },
        expected: undefined,
      },
    ]);
  });

  it("matches a learned domain without matching lookalike domains", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "@acme.com", exclude: false },
      { type: GroupItemType.FROM, value: "news.io", exclude: false },
    ];

    expectMatchResults(groupItems, [
      {
        email: { from: "Billing <billing@acme.com>", subject: "" },
        expected: groupItems[0],
      },
      {
        email: { from: "billing@acme.com.evil.io", subject: "" },
        expected: undefined,
      },
      {
        email: { from: "daily@news.io", subject: "" },
        expected: groupItems[1],
      },
      {
        email: { from: "daily@mail.news.io", subject: "" },
        expected: groupItems[1],
      },
      {
        email: { from: "daily@fakenews.io", subject: "" },
        expected: undefined,
      },
    ]);
  });

  it("still matches a learned display name anywhere in the From header", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "LinkedIn", exclude: false },
    ];

    expectMatchResults(groupItems, [
      {
        email: {
          from: "LinkedIn Jobs <jobs-noreply@linkedin.com>",
          subject: "",
        },
        expected: groupItems[0],
      },
    ]);
  });

  it("matches a learned pattern saved as a full From header by its address", () => {
    const groupItems = [
      {
        type: GroupItemType.FROM,
        value: "Ann Lee <ann@acme.com>",
        exclude: false,
      },
    ];

    expectMatchResults(groupItems, [
      { email: { from: "ann@acme.com", subject: "" }, expected: groupItems[0] },
      {
        email: { from: "joann@acme.com", subject: "" },
        expected: undefined,
      },
    ]);
  });

  it("matches each address in a learned value that lists several", () => {
    const groupItems = [
      {
        type: GroupItemType.FROM,
        value: "ann@acme.com, @news.io",
        exclude: false,
      },
    ];

    expectMatchResults(groupItems, [
      { email: { from: "ann@acme.com", subject: "" }, expected: groupItems[0] },
      {
        email: { from: "daily@news.io", subject: "" },
        expected: groupItems[0],
      },
      {
        email: { from: "joann@acme.com", subject: "" },
        expected: undefined,
      },
    ]);
  });

  it("does not split a learned full header on a comma in its display name", () => {
    const groupItems = [
      {
        type: GroupItemType.FROM,
        value: "Acme, Inc <ann@acme.com>",
        exclude: true,
      },
    ];

    expect(
      findMatchingGroupItem(
        { from: "Acme Team <other@example.com>", subject: "" },
        groupItems,
      ),
    ).toBeUndefined();
    expect(
      findMatchingGroupItem({ from: "ann@acme.com", subject: "" }, groupItems),
    ).toBeNull();
  });

  it("does not let an exclusion for one sender exclude a lookalike sender", () => {
    const groupItems = [
      { type: GroupItemType.FROM, value: "@acme.com", exclude: false },
      { type: GroupItemType.FROM, value: "ann@acme.com", exclude: true },
    ];

    expect(
      findMatchingGroupItem(
        { from: "joann@acme.com", subject: "" },
        groupItems,
      ),
    ).toBe(groupItems[0]);
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

  it("protects legacy inclusions with unknown ownership from automatic exclusions", () => {
    const legacy = {
      type: GroupItemType.FROM,
      value: "sender@example.com",
      exclude: false,
      source: null,
    };
    expect(
      findMatchingGroupItem({ from: "sender@example.com", subject: "" }, [
        legacy,
        {
          type: GroupItemType.FROM,
          value: "@example.com",
          exclude: true,
          source: GroupItemSource.LABEL_REMOVED,
          updatedAt: new Date(),
        },
      ]),
    ).toBe(legacy);
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
