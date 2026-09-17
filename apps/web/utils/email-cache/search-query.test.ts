import { afterEach, describe, expect, it, vi } from "vitest";
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
  it("excludes negated terms", () => {
    expect(matches("-absent")).toBe(true);
    expect(matches("-forecast")).toBe(false);
    expect(matches("report -absent")).toBe(true);
    expect(matches("report -forecast")).toBe(false);
    expect(matches("-from:other@example.com")).toBe(true);
    expect(matches("-is:starred")).toBe(true);
    expect(matches("-is:unread")).toBe(false);
    expect(matches('-"quarterly report"')).toBe(false);
  });
  it("accepts either side of a disjunction", () => {
    expect(matches("absent OR forecast")).toBe(true);
    expect(matches("forecast OR absent")).toBe(true);
    expect(matches("absent OR missing")).toBe(false);
    expect(matches("from:other@example.com OR from:user@example.com")).toBe(
      true,
    );
    expect(matches("is:starred OR is:unread")).toBe(true);
    expect(matches("absent OR missing OR forecast")).toBe(true);
  });
  it("binds a disjunction tighter than adjacency", () => {
    expect(matches("absent OR forecast budget")).toBe(true);
    expect(matches("absent OR forecast missing")).toBe(false);
    expect(matches("missing absent OR forecast")).toBe(false);
  });
  it("groups with parentheses and negates a whole group", () => {
    expect(matches("(absent OR forecast) budget")).toBe(true);
    expect(matches("(absent OR missing) budget")).toBe(false);
    expect(matches("forecast (absent OR budget)")).toBe(true);
    expect(matches("-(absent OR missing)")).toBe(true);
    expect(matches("-(absent OR forecast)")).toBe(false);
    expect(matches("budget -(forecast OR missing)")).toBe(false);
    expect(matches("(forecast (budget OR absent)) OR missing")).toBe(true);
  });
  it("treats an explicit conjunction like adjacency", () => {
    expect(matches("forecast AND budget")).toBe(true);
    expect(matches("forecast AND absent")).toBe(false);
    expect(matches("forecast AND (absent OR budget)")).toBe(true);
  });
  it("keeps a widened corpus available to boolean queries", () => {
    const trashed = { ...message, labelIds: ["TRASH"] };
    const parsed = parseLocalSearch("in:anywhere (report OR absent)", [])!;
    expect(parsed).toBeDefined();
    expect(matchesLocalSearch(trashed, parsed)).toBe(true);
  });
  afterEach(() => vi.useRealTimers());
  it("reads relative and aliased date operators", () => {
    // The fixture is dated 2026-09-10; anchor the clock five days later.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
    expect(matches("newer_than:7d")).toBe(true);
    expect(matches("newer_than:2d")).toBe(false);
    expect(matches("older_than:2d")).toBe(true);
    expect(matches("older_than:7d")).toBe(false);
    expect(matches("newer_than:1m")).toBe(true);
    expect(matches("older_than:1m")).toBe(false);
    expect(matches("newer_than:1y")).toBe(true);
    expect(matches("older_than:1y")).toBe(false);
    expect(matches("newer_than:7d older_than:2d")).toBe(true);
    expect(matches("newer_than:2d OR older_than:2d")).toBe(true);
    expect(matches("-newer_than:2d")).toBe(true);
    expect(matches("newer:2026/09/09")).toBe(true);
    expect(matches("older:2026/09/09")).toBe(false);
    expect(matches("older:2026/09/11")).toBe(true);
  });
  it.each([
    "{a b}",
    "has:attachment",
    "newer_than:7",
    "newer_than:d",
    "newer_than:7w",
    "newer_than:-7d",
    "older_than:",
    "newer:2026/02/30",
    "larger:1M",
    "is:unknown",
    "from:",
    '"unfinished',
    "after:2026/02/30",
    "label:unknown",
    "a*",
    "a NOT b",
    "+exact",
    "a OR",
    "OR a",
    "a AND",
    "AND a",
    "(a",
    "a)",
    "()",
    "-",
    "a -",
  ])("defers unsupported or incomplete syntax: %s", (query) => {
    expect(parseLocalSearch(query, [])).toBeUndefined();
  });
  it("keeps spam and trash out when the query only excludes them", () => {
    const spam = { ...message, labelIds: ["SPAM"] };
    const trashed = { ...message, labelIds: ["TRASH"] };
    expect(
      matchesLocalSearch(spam, parseLocalSearch("-in:trash report", [])!),
    ).toBe(false);
    expect(
      matchesLocalSearch(trashed, parseLocalSearch("-in:spam report", [])!),
    ).toBe(false);
    expect(
      matchesLocalSearch(spam, parseLocalSearch("report -(in:trash)", [])!),
    ).toBe(false);
    expect(
      matchesLocalSearch(spam, parseLocalSearch("-in:anywhere report", [])!),
    ).toBe(false);
    // Excluding one of them is still not a reason to hide the other's corpus
    // when the query also asks for it.
    expect(
      matchesLocalSearch(spam, parseLocalSearch("in:spam -in:trash", [])!),
    ).toBe(true);
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

  it("treats Gmail mail without a live mailbox location as archived", () => {
    const archived = { ...message, labelIds: ["UNREAD"] };
    expect(
      matchesLocalSearch(archived, parseLocalSearch("in:archive", [])!),
    ).toBe(true);
    expect(matches("in:archive")).toBe(false);
  });

  it("still matches Outlook archive via the ARCHIVE label", () => {
    const outlookArchive = { ...message, labelIds: ["ARCHIVE", "UNREAD"] };
    expect(
      matchesLocalSearch(outlookArchive, parseLocalSearch("in:archive", [])!),
    ).toBe(true);
  });

  it("does not treat sent, draft, spam, or trash as archived", () => {
    for (const label of ["SENT", "DRAFT", "SPAM", "TRASH"]) {
      expect(
        matchesLocalSearch(
          { ...message, labelIds: [label] },
          parseLocalSearch("in:archive", [])!,
        ),
      ).toBe(false);
    }
  });
});
