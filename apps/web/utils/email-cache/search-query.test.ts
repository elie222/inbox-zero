import { describe, expect, it } from "vitest";
import { matchesLocalSearch, parseLocalSearch } from "./search-query";

const message = {
  id: "message",
  threadId: "thread",
  subject: "Quarterly report",
  snippet: "Budget review",
  headers: {
    from: "User <user@example.com>",
    to: "team@example.com",
    subject: "Quarterly report",
    date: "",
  },
  labelIds: ["INBOX", "UNREAD", "Label_work"],
  internalDate: String(Date.parse("2026-09-10T12:00:00Z")),
  textPlain: "The confidential forecast is ready. 東京の予定",
};

function matches(query: string) {
  const parsed = parseLocalSearch(query, [
    { id: "Label_work", name: "Work Projects" },
  ]);
  expect(parsed).toBeDefined();
  return matchesLocalSearch(message, parsed!);
}

describe("local search queries", () => {
  it("matches cached bodies, headers, phrases and multilingual text", () => {
    expect(matches('from:USER@example.com "quarterly report" forecast')).toBe(
      true,
    );
    expect(matches("東京")).toBe(true);
    expect(matches("forecast absent")).toBe(false);
    expect(matches('"report quarterly"')).toBe(false);
  });
  it("requires conditions to match the same message", () => {
    expect(matches("subject:budget")).toBe(false);
    expect(matches("to:team@example.com is:unread in:inbox")).toBe(true);
    expect(matches("is:starred")).toBe(false);
    expect(matches("is:flagged")).toBe(false);
    expect(matches('label:"Work Projects"')).toBe(true);
    expect(matches('category:"Work Projects"')).toBe(true);
    expect(matches("after:2026/09/09 before:2026/09/11")).toBe(true);
    expect(matches("before:2026/09/10")).toBe(false);
  });
  it.each([
    "a OR b",
    "(a b)",
    "{a b}",
    "-forecast",
    "has:attachment",
    "larger:1M",
    "is:unknown",
    "from:",
    '"unfinished',
    "after:2026/02/30",
    "label:unknown",
    "a*",
    "a AND b",
  ])("defers unsupported or incomplete syntax: %s", (query) => {
    expect(parseLocalSearch(query, [])).toBeUndefined();
  });
  it("excludes spam and trash unless explicitly requested", () => {
    const trashed = { ...message, labelIds: ["TRASH"] };
    expect(matchesLocalSearch(trashed, parseLocalSearch("report", [])!)).toBe(
      false,
    );
    expect(
      matchesLocalSearch(trashed, parseLocalSearch("in:trash report", [])!),
    ).toBe(true);
    expect(
      matchesLocalSearch(trashed, parseLocalSearch("in:anywhere report", [])!),
    ).toBe(true);
  });
});
