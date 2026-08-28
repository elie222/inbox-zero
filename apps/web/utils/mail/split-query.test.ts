import { describe, expect, it } from "vitest";
import { MailSplitKind } from "@/generated/prisma/enums";
import {
  getPortableLabelSplits,
  mailSplitToThreadsQuery,
} from "@/utils/mail/split-query";

function split(
  kind: MailSplitKind,
  value: string | null = null,
): Parameters<typeof mailSplitToThreadsQuery>[0] {
  return { id: "split-1", name: "Test split", kind, value };
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
    ).toEqual([{ ...labelSplit, labelName: "Receipts" }]);
  });

  it("omits label splits whose source label no longer exists", () => {
    expect(
      getPortableLabelSplits([split(MailSplitKind.LABEL, "missing-label")], {}),
    ).toEqual([]);
  });
});
