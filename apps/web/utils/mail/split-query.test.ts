import { describe, expect, it } from "vitest";
import { MailSplitKind } from "@/generated/prisma/enums";
import { mailSplitToThreadsQuery } from "@/utils/mail/split-query";

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

  it("queries by label id, not by label name", () => {
    expect(
      mailSplitToThreadsQuery(split(MailSplitKind.LABEL, "Label_42")),
    ).toEqual({ labelId: "Label_42" });
  });

  it("passes a provider category through as the type", () => {
    expect(
      mailSplitToThreadsQuery(
        split(MailSplitKind.CATEGORY, "CATEGORY_PERSONAL"),
      ),
    ).toEqual({ type: "CATEGORY_PERSONAL" });
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
