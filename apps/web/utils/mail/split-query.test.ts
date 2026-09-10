import { describe, expect, it } from "vitest";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import {
  getPortableLabelSplits,
  mailSplitToThreadsQuery,
  type MailSplit,
} from "@/utils/mail/split-query";

const NOW = new Date("2026-09-09T12:00:00.000Z");

function split(
  filters: { kind: MailSplitFilterKind; value?: string | null }[],
  matchAll = true,
): MailSplit {
  return {
    id: "split-1",
    name: "Test split",
    matchAll,
    filters: filters.map((filter) => ({
      kind: filter.kind,
      value: filter.value ?? null,
    })),
  };
}

describe("mailSplitToThreadsQuery", () => {
  it("scopes a split with no conditions to the inbox", () => {
    expect(mailSplitToThreadsQuery(split([]), NOW)).toEqual({ type: "inbox" });
  });

  it("asks the server for unread rather than filtering loaded pages", () => {
    expect(
      mailSplitToThreadsQuery(
        split([{ kind: MailSplitFilterKind.UNREAD }]),
        NOW,
      ),
    ).toEqual({ isUnread: true, labelIds: ["INBOX"] });
  });

  it("limits label splits to matching inbox mail", () => {
    expect(
      mailSplitToThreadsQuery(
        split([{ kind: MailSplitFilterKind.LABEL, value: "Label_42" }]),
        NOW,
      ),
    ).toEqual({ labelIds: ["INBOX", "Label_42"] });
  });

  it("queries Outlook's focused section inside the inbox", () => {
    expect(
      mailSplitToThreadsQuery(
        split([{ kind: MailSplitFilterKind.CATEGORY, value: "focused" }]),
        NOW,
      ),
    ).toEqual({ inboxSection: "focused", type: "inbox" });
  });

  it("combines every condition into one query when matching all", () => {
    expect(
      mailSplitToThreadsQuery(
        split([
          { kind: MailSplitFilterKind.UNREAD },
          { kind: MailSplitFilterKind.LABEL, value: "Label_42" },
          { kind: MailSplitFilterKind.FROM, value: "priya@northwind.co" },
          { kind: MailSplitFilterKind.OLDER_THAN, value: "1w" },
        ]),
        NOW,
      ),
    ).toEqual({
      isUnread: true,
      fromEmail: "priya@northwind.co",
      before: new Date("2026-09-02T12:00:00.000Z"),
      labelIds: ["INBOX", "Label_42"],
    });
  });

  it("keeps two labels as separate conditions rather than overwriting one", () => {
    expect(
      mailSplitToThreadsQuery(
        split([
          { kind: MailSplitFilterKind.LABEL, value: "Label_1" },
          { kind: MailSplitFilterKind.LABEL, value: "Label_2" },
        ]),
        NOW,
      ),
    ).toEqual({ labelIds: ["INBOX", "Label_1", "Label_2"] });
  });

  it("turns each condition into its own branch when matching any", () => {
    expect(
      mailSplitToThreadsQuery(
        split(
          [
            {
              kind: MailSplitFilterKind.FROM,
              value: "notifications@linear.app",
            },
            { kind: MailSplitFilterKind.FROM, value: "mentions@linear.app" },
          ],
          false,
        ),
        NOW,
      ),
    ).toEqual({
      labelIds: ["INBOX"],
      anyOf: [
        { fromEmail: "notifications@linear.app" },
        { fromEmail: "mentions@linear.app" },
      ],
    });
  });

  it("keeps a starred condition on the provider rather than filtering locally", () => {
    expect(
      mailSplitToThreadsQuery(
        split([{ kind: MailSplitFilterKind.STARRED }]),
        NOW,
      ),
    ).toEqual({ labelIds: ["INBOX", "STARRED"] });
  });

  it.each([
    [MailSplitFilterKind.LABEL, /has no label/],
    [MailSplitFilterKind.CATEGORY, /has no category/],
    [MailSplitFilterKind.FROM, /has no sender/],
  ])("throws rather than silently querying the whole inbox when %s has no value", (kind, message) => {
    expect(() => mailSplitToThreadsQuery(split([{ kind }]), NOW)).toThrow(
      message,
    );
  });

  it("throws rather than guessing when the age token is unknown", () => {
    expect(() =>
      mailSplitToThreadsQuery(
        split([{ kind: MailSplitFilterKind.OLDER_THAN, value: "7y" }]),
        NOW,
      ),
    ).toThrow(/unknown age/);
  });
});

describe("getPortableLabelSplits", () => {
  it("uses the source label names as the cross-account identity", () => {
    const labelSplit = {
      ...split([{ kind: MailSplitFilterKind.LABEL, value: "source-label-id" }]),
      name: "Custom tab title",
    };

    expect(
      getPortableLabelSplits(
        [
          labelSplit,
          split([
            { kind: MailSplitFilterKind.CATEGORY, value: "CATEGORY_UPDATES" },
          ]),
        ],
        { "source-label-id": { name: "Receipts" } },
      ),
    ).toEqual([{ ...labelSplit, labelNames: ["Receipts"] }]);
  });

  it("omits splits whose source label no longer exists", () => {
    expect(
      getPortableLabelSplits(
        [split([{ kind: MailSplitFilterKind.LABEL, value: "missing-label" }])],
        {},
      ),
    ).toEqual([]);
  });
});

it.each([
  ["3d", "1m"],
  ["1m", "3d"],
])("uses the stricter age when matching all conditions: %s, %s", (first, second) => {
  expect(
    mailSplitToThreadsQuery(
      split(
        [first, second].map((value) => ({
          kind: MailSplitFilterKind.OLDER_THAN,
          value,
        })),
      ),
      NOW,
    ).before,
  ).toEqual(new Date("2026-08-10T12:00:00.000Z"));
});
