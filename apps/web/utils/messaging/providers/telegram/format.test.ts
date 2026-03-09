import { describe, expect, it } from "vitest";
import { markdownToTelegramText } from "./format";

describe("markdownToTelegramText", () => {
  it("normalizes escaped markdown from assistant output", () => {
    const input = `**Inbox: 157 total, 69 unread (20 recent unread sampled, all uncategorized). No "To Reply" items.**

**Must check:**

* 2x Security alerts from Google <no-reply@accounts.google.com> (Inbox Zero access confirmations) \\[IDs: 19cab71f8af095ad, 19c9aaa940710c26]

**Newsletter clutter (14+):**

* Morning Brew <crew@morningbrew.com> (4x: Homebuying Brew, AI battle, etc.)`;

    const expected = `Inbox: 157 total, 69 unread (20 recent unread sampled, all uncategorized). No "To Reply" items.

Must check:

• 2x Security alerts from Google <no-reply@accounts.google.com> (Inbox Zero access confirmations) [IDs: 19cab71f8af095ad, 19c9aaa940710c26]

Newsletter clutter (14+):

• Morning Brew <crew@morningbrew.com> (4x: Homebuying Brew, AI battle, etc.)`;

    expect(markdownToTelegramText(input)).toBe(expected);
  });

  it("normalizes list markers and removes hard break escapes", () => {
    const input = `**To:** <demoinboxzero@outlook.com>\\
**Subject:** How are you?\\
**Body:** Hi there,

\\* Item one
\\- Item two`;

    const expected = `To: <demoinboxzero@outlook.com>
Subject: How are you?
Body: Hi there,

• Item one
• Item two`;

    expect(markdownToTelegramText(input)).toBe(expected);
  });
});
