import { describe, expect, it } from "vitest";
import { MailSplitKind } from "@/generated/prisma/enums";
import {
  getPortableLabelSplits,
  mailSplitToThreadsQuery,
} from "@/utils/mail/split-query";

function split(
  kind: MailSplitKind,
  ...values: string[]
): Parameters<typeof mailSplitToThreadsQuery>[0] {
  return { id: "split-1", name: "Test split", kind, values };
}

describe("mailSplitToThreadsQuery", () => {
  it("scopes the default split to the inbox", () => {
    expect(mailSplitToThreadsQuery(split(MailSplitKind.INBOX))).toEqual({
      type: "inbox",
    });
  });

  it("asks the server for unread rather than filtering loaded pages", () => {
    expect(mailSplitToThreadsQuery(split(MailSplitKind.UNREAD))).toEqual({
      type: "inbox",
      isUnread: true,
    });
  });

  it("limits label splits to matching inbox mail", () => {
    expect(
      mailSplitToThreadsQuery(split(MailSplitKind.LABEL, "Label_42")),
    ).toEqual({ labelIds: ["Label_42", "INBOX"] });
  });

  it("limits provider category splits to matching inbox mail", () => {
    expect(
      mailSplitToThreadsQuery(
        split(MailSplitKind.CATEGORY, "CATEGORY_PERSONAL"),
      ),
    ).toEqual({ labelIds: ["CATEGORY_PERSONAL", "INBOX"] });
  });

  it.each([
    "focused",
    "other",
  ] as const)("queries Outlook's %s section inside the inbox", (inboxSection) => {
    expect(
      mailSplitToThreadsQuery(split(MailSplitKind.CATEGORY, inboxSection)),
    ).toEqual({ type: "inbox", inboxSection });
  });

  it("merges a multi-label split into one inbox query", () => {
    expect(
      mailSplitToThreadsQuery(
        split(MailSplitKind.LABEL, "Label_42", "Label_43"),
      ),
    ).toEqual({ labelIds: ["INBOX"], anyLabelIds: ["Label_42", "Label_43"] });
  });

  it.each([
    MailSplitKind.LABEL,
    MailSplitKind.CATEGORY,
  ])("throws rather than silently querying the whole inbox when %s has no value", (kind) => {
    expect(() => mailSplitToThreadsQuery(split(kind))).toThrow(
      /has no (label|category)/,
    );
  });
});

describe("getPortableLabelSplits", () => {
  it("uses the source label name as the cross-account identity", () => {
    const labelSplit = {
      ...split(MailSplitKind.LABEL, "source-label-id"),
      name: "Custom tab title",
    };

    expect(
      getPortableLabelSplits(
        [labelSplit, split(MailSplitKind.CATEGORY, "CATEGORY_UPDATES")],
        { "source-label-id": { name: "Receipts" } },
      ),
    ).toEqual([{ ...labelSplit, labelNames: ["Receipts"] }]);
  });

  it("omits label splits whose source label no longer exists", () => {
    expect(
      getPortableLabelSplits([split(MailSplitKind.LABEL, "missing-label")], {}),
    ).toEqual([]);
  });

  it("carries every label name of a multi-label split", () => {
    const labelSplit = split(MailSplitKind.LABEL, "one", "two");

    expect(
      getPortableLabelSplits([labelSplit], {
        one: { name: "One" },
        two: { name: "Two" },
      }),
    ).toEqual([{ ...labelSplit, labelNames: ["One", "Two"] }]);
  });

  it("omits a multi-label split when one of its labels is gone", () => {
    expect(
      getPortableLabelSplits([split(MailSplitKind.LABEL, "one", "missing")], {
        one: { name: "One" },
      }),
    ).toEqual([]);
  });
});
