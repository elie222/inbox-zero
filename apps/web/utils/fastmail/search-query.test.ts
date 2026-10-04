import { describe, expect, it } from "vitest";
import { parseFastmailSearchQuery } from "./search-query";

const mailboxes = [
  { id: "inbox-id", name: "Inbox", role: "inbox" },
  { id: "trash-id", name: "Trash", role: "trash" },
  { id: "reply-id", name: "To Reply", role: null },
];
const now = new Date("2026-10-04T12:00:00Z");

describe("Fastmail search query translation", () => {
  it("translates the assistant's recent unread inbox search", () => {
    expect(
      parseFastmailSearchQuery(
        "is:unread in:inbox newer_than:2d",
        mailboxes,
        now,
      ),
    ).toEqual({
      filter: {
        operator: "AND",
        conditions: [
          { notKeyword: "$seen" },
          { inMailbox: "inbox-id" },
          { after: "2026-10-02T12:00:00.000Z" },
        ],
      },
      includeSpamTrash: false,
    });
  });

  it("preserves quoted phrases and negated exact mailbox filters", () => {
    expect(
      parseFastmailSearchQuery(
        'from:sender@example.com subject:"status report" -label:"To Reply" has:attachment',
        mailboxes,
        now,
      ).filter,
    ).toEqual({
      operator: "AND",
      conditions: [
        { from: "sender@example.com" },
        { subject: "status report" },
        { operator: "NOT", conditions: [{ inMailbox: "reply-id" }] },
        { hasAttachment: true },
      ],
    });
  });

  it("preserves punctuation inside literal quoted text", () => {
    expect(
      parseFastmailSearchQuery('"meeting at 10:30 (OR later)"', mailboxes)
        .filter,
    ).toEqual({
      operator: "AND",
      conditions: [{ text: "meeting at 10:30 (OR later)" }],
    });
  });

  it("supports absolute date boundaries and text", () => {
    expect(
      parseFastmailSearchQuery(
        'after:2026/10/01 before:2026-10-04 "project update"',
        mailboxes,
        now,
      ).filter,
    ).toEqual({
      operator: "AND",
      conditions: [
        { after: "2026-10-01T00:00:00.000Z" },
        { before: "2026-10-04T00:00:00.000Z" },
        { text: "project update" },
      ],
    });
  });

  it.each([
    "in:trash",
    "in:anywhere",
  ])("does not exclude explicitly requested spam/trash (%s)", (query) => {
    expect(
      parseFastmailSearchQuery(query, mailboxes, now).includeSpamTrash,
    ).toBe(true);
  });

  it.each([
    "category:promotions",
    "is:important",
    "newer_than:garbage",
    "after:2026/02/31",
    'label:"Missing"',
    'subject:"unclosed',
    "one OR two",
  ])("rejects unsupported or malformed queries instead of silently changing their meaning (%s)", (query) => {
    expect(() => parseFastmailSearchQuery(query, mailboxes, now)).toThrow();
  });
});
