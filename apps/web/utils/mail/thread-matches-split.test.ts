import { describe, expect, it } from "vitest";
import type { EmailThread } from "@/utils/email/types";
import { otherMailSplitQuery, type MailSplit } from "@/utils/mail/split-query";
import { createOtherSplitFilter } from "@/utils/mail/thread-matches-split";

const now = new Date("2026-01-10T12:00:00Z");
const important: MailSplit = {
  id: "important",
  name: "Important",
  matchAll: true,
  filters: [{ kind: "LABEL", value: "IMPORTANT" }],
};

describe("Other inbox membership", () => {
  it("excludes a conversation when an earlier inbox message matches a split", () => {
    expect(
      threadMatchesSplit(
        thread(["INBOX", "IMPORTANT"], ["INBOX"]),
        important,
        now,
      ),
    ).toBe(true);
    expect(
      threadMatchesSplit(thread(["IMPORTANT"], ["INBOX"]), important, now),
    ).toBe(false);
  });

  it("keeps AND conditions on the same message and allows OR across conditions", () => {
    const split: MailSplit = {
      ...important,
      filters: [...important.filters, { kind: "STARRED", value: null }],
    };
    const conversation = thread(["INBOX", "IMPORTANT"], ["INBOX", "STARRED"]);
    expect(threadMatchesSplit(conversation, split, now)).toBe(false);
    expect(
      threadMatchesSplit(conversation, { ...split, matchAll: false }, now),
    ).toBe(true);
  });

  it("ignores All and stops excluding a split once it is removed", () => {
    const all = { ...important, id: "all", name: "All", filters: [] };
    expect(otherMailSplitQuery([all, important]).excludeSplits).toEqual([
      { matchAll: important.matchAll, filters: important.filters },
    ]);
    expect(otherMailSplitQuery([all]).excludeSplits).toEqual([]);
    expect(threadMatchesSplit(thread(["INBOX"]), all, now)).toBe(false);
  });

  it.each([
    undefined,
    null,
    "",
    "invalid",
    "2026-01-10T12:00:00Z",
  ])("keeps mail with a non-old timestamp in Other: %s", (internalDate) => {
    const conversation = thread(["INBOX"]);
    conversation.messages[0].internalDate = internalDate;
    expect(
      createOtherSplitFilter(
        [{ matchAll: true, filters: [{ kind: "OLDER_THAN", value: "3d" }] }],
        now,
      )(conversation),
    ).toBe(true);
  });

  it("recognizes old ISO timestamps", () => {
    const conversation = thread(["INBOX"]);
    conversation.messages[0].internalDate = "2026-01-01T12:00:00Z";
    expect(
      createOtherSplitFilter(
        [{ matchAll: true, filters: [{ kind: "OLDER_THAN", value: "3d" }] }],
        now,
      )(conversation),
    ).toBe(false);
  });

  it("matches sender, read state, category and age together", () => {
    const split: MailSplit = {
      ...important,
      filters: [
        { kind: "FROM", value: "sender@example.com" },
        { kind: "UNREAD", value: null },
        { kind: "CATEGORY", value: "CATEGORY_UPDATES" },
        { kind: "OLDER_THAN", value: "3d" },
      ],
    };
    const conversation = thread(["INBOX", "UNREAD", "CATEGORY_UPDATES"]);
    expect(threadMatchesSplit(conversation, split, now)).toBe(true);
    conversation.messages[0].internalDate = String(now.getTime());
    expect(threadMatchesSplit(conversation, split, now)).toBe(false);
  });
});

function thread(...labels: string[][]): EmailThread {
  return {
    id: "thread",
    snippet: "",
    messages: labels.map((labelIds, index) => ({
      id: String(index),
      labelIds,
      headers: { from: "Sender <SENDER@example.com>" },
      internalDate: String(new Date("2026-01-01T12:00:00Z").getTime()),
    })),
  } as EmailThread;
}

function threadMatchesSplit(thread: EmailThread, split: MailSplit, now: Date) {
  return !createOtherSplitFilter([split], now)(thread);
}
