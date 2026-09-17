import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createSearchIndex } from "./search-index";
import {
  matchesLocalSearch,
  parseLocalSearch,
  type SearchMessage,
} from "./search-query";

const emailAccountId = "account-1";
const generation = "generation-1";
const labels = [{ id: "Label_work", name: "Work Projects" }];

let sqlite3: Awaited<ReturnType<typeof sqlite3InitModule>>;
beforeAll(async () => {
  sqlite3 = await sqlite3InitModule();
});

function message(
  id: string,
  fields: {
    from: string;
    subject: string;
    body: string;
    labelIds?: string[];
    date?: string;
  },
): SearchMessage {
  return {
    id,
    threadId: `thread-${id}`,
    subject: fields.subject,
    snippet: fields.body.slice(0, 40),
    headers: {
      from: fields.from,
      to: "team@example.com",
      subject: fields.subject,
      date: "",
    },
    labelIds: fields.labelIds ?? ["INBOX"],
    internalDate: String(Date.parse(fields.date ?? "2026-09-10T12:00:00Z")),
    textPlain: fields.body,
  };
}

const corpus = [
  message("first", {
    from: "alice@example.com",
    subject: "Quarterly report",
    body: "The forecast is ready",
    labelIds: ["INBOX", "Label_work"],
    date: "2026-09-01T12:00:00Z",
  }),
  message("second", {
    from: "bob@example.com",
    subject: "Budget review",
    body: "Numbers are ok",
    date: "2026-09-02T12:00:00Z",
  }),
  message("third", {
    from: "carol@example.com",
    subject: "Quarterly budget",
    body: "The forecast moved",
    labelIds: ["INBOX", "Label_work"],
    date: "2026-09-03T12:00:00Z",
  }),
];

function search(query: string, documents: SearchMessage[] = corpus) {
  const database = new sqlite3.oo1.DB(":memory:", "c");
  const index = createSearchIndex(database);
  index.resetAccount({
    emailAccountId,
    generation,
    expectedGeneration: null,
  });
  index.applyBatch({
    emailAccountId,
    generation,
    expectedRevision: 0,
    revision: 1,
    upserts: documents,
    deletes: [],
  });
  const page = index.search({ emailAccountId, generation, query, labels });
  database.close();
  expect(page.status).toBe("ready");
  return page.messages.map((result) => result.id);
}

describe("boolean queries against the local index", () => {
  it("returns newest first for a plain term", () => {
    expect(search("quarterly")).toEqual(["third", "first"]);
  });
  it("excludes negated terms", () => {
    expect(search("-forecast")).toEqual(["second"]);
    expect(search("quarterly -forecast")).toEqual([]);
    expect(search("quarterly -budget")).toEqual(["first"]);
    expect(search("-from:alice@example.com")).toEqual(["third", "second"]);
    expect(search('-label:"Work Projects"')).toEqual(["second"]);
  });
  it("accepts either side of a disjunction", () => {
    expect(search("alice@example.com OR bob@example.com")).toEqual([
      "second",
      "first",
    ]);
    expect(search("subject:budget OR subject:report")).toEqual([
      "third",
      "second",
      "first",
    ]);
    expect(search("missing OR forecast")).toEqual(["third", "first"]);
  });
  it("matches a disjunction that spans both tokenizers", () => {
    // "ok" is shorter than a trigram, so it and "forecast" cannot share one
    // FTS expression; the result must still be the union.
    expect(search("ok OR forecast")).toEqual(["third", "second", "first"]);
    expect(search("ok OR missing")).toEqual(["second"]);
  });
  it("binds a disjunction tighter than adjacency", () => {
    expect(search("report OR budget quarterly")).toEqual(["third", "first"]);
    expect(search("report OR budget forecast")).toEqual(["third", "first"]);
  });
  it("groups with parentheses and negates a whole group", () => {
    expect(search("(report OR budget) -forecast")).toEqual(["second"]);
    expect(search("-(report OR budget)")).toEqual([]);
    expect(search("quarterly (forecast OR missing)")).toEqual([
      "third",
      "first",
    ]);
  });
  it("combines a disjunction with labels and dates", () => {
    expect(search('label:"Work Projects" OR subject:budget')).toEqual([
      "third",
      "second",
      "first",
    ]);
    expect(search('label:"Work Projects" forecast')).toEqual([
      "third",
      "first",
    ]);
    expect(search("after:2026/09/02 OR from:alice@example.com")).toEqual([
      "third",
      "second",
      "first",
    ]);
    expect(search("-after:2026/09/02")).toEqual(["first"]);
  });
  it("still prunes the scan on a top-level date bound", () => {
    expect(search("after:2026/09/02 quarterly")).toEqual(["third"]);
    expect(search("before:2026/09/02 quarterly")).toEqual(["first"]);
  });
  it("keeps spam and trash out when the query only excludes them", () => {
    const hidden = [
      message("spam", {
        from: "spammer@example.com",
        subject: "Quarterly report",
        body: "The forecast is ready",
        labelIds: ["SPAM"],
      }),
      message("trashed", {
        from: "alice@example.com",
        subject: "Quarterly report",
        body: "Numbers are ok",
        labelIds: ["TRASH"],
      }),
    ];
    expect(search("-in:trash quarterly", hidden)).toEqual([]);
    expect(search("-in:spam quarterly", hidden)).toEqual([]);
    expect(search("in:spam quarterly", hidden)).toEqual(["spam"]);
  });
  // `in:archive` has no label of its own on Gmail, so the index cannot answer
  // it by token. Both paths must still agree, or the answer depends on which
  // one happens to serve the query.
  it.each([
    { name: "Gmail archived", labelIds: ["UNREAD"], archived: true },
    {
      name: "Outlook archived",
      labelIds: ["ARCHIVE", "UNREAD"],
      archived: true,
    },
    { name: "inbox", labelIds: ["INBOX"], archived: false },
    { name: "sent", labelIds: ["SENT"], archived: false },
    { name: "draft", labelIds: ["DRAFT"], archived: false },
    { name: "unlabelled", labelIds: [], archived: false },
  ])("answers in:archive the same way for $name mail", (scenario) => {
    const record = message("only", {
      from: "alice@example.com",
      subject: "Quarterly report",
      body: "The forecast is ready",
      labelIds: scenario.labelIds,
    });
    expect(search("in:archive", [record])).toEqual(
      scenario.archived ? ["only"] : [],
    );
    expect(
      matchesLocalSearch(record, parseLocalSearch("in:archive", [])!),
    ).toBe(scenario.archived);
  });
  afterEach(() => vi.useRealTimers());
  it("prunes the scan on a relative date bound", () => {
    // The corpus spans 1 to 3 September at noon. Anchor the clock off that
    // hour so no boundary ties with a message; the comparison is strict.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T06:00:00Z"));
    expect(search("newer_than:2d")).toEqual(["third", "second"]);
    expect(search("older_than:2d")).toEqual(["first"]);
    expect(search("newer_than:2d quarterly")).toEqual(["third"]);
    expect(search("-newer_than:2d")).toEqual(["first"]);
    expect(search("newer_than:1y")).toEqual(["third", "second", "first"]);
  });
  it("rebuilds an index written by a different schema version", () => {
    const database = new sqlite3.oo1.DB(":memory:", "c");
    const index = createSearchIndex(database);
    index.resetAccount({
      emailAccountId,
      generation,
      expectedGeneration: null,
    });
    index.applyBatch({
      emailAccountId,
      generation,
      expectedRevision: 0,
      revision: 1,
      upserts: corpus,
      deletes: [],
    });
    // A future or downgraded build leaves a layout this one cannot read. The
    // index is derived from the local mail store, so it must be discarded and
    // rebuilt rather than failing every request for good.
    database.exec("PRAGMA user_version=99");
    const reopened = createSearchIndex(database);
    expect(reopened.getAccountState(emailAccountId)).toBeNull();
    reopened.resetAccount({
      emailAccountId,
      generation,
      expectedGeneration: null,
    });
    reopened.applyBatch({
      emailAccountId,
      generation,
      expectedRevision: 0,
      revision: 1,
      upserts: corpus,
      deletes: [],
    });
    expect(
      reopened
        .search({ emailAccountId, generation, query: "quarterly", labels })
        .messages.map((result) => result.id),
    ).toEqual(["third", "first"]);
    const fresh = new sqlite3.oo1.DB(":memory:", "c");
    createSearchIndex(fresh);
    const current = Number(fresh.selectValue("PRAGMA user_version"));
    fresh.close();
    expect(Number(database.selectValue("PRAGMA user_version"))).toBe(current);
    database.close();
  });
  it("finds attachments from either provider's signal", () => {
    const documents = [
      message("gmail", {
        from: "alice@example.com",
        subject: "Quarterly report",
        body: "The forecast is ready",
      }),
      message("outlook", {
        from: "bob@example.com",
        subject: "Budget review",
        body: "Numbers are ok",
      }),
      message("plain", {
        from: "carol@example.com",
        subject: "Quarterly lunch",
        body: "No files here",
      }),
    ];
    // Gmail keeps attachment metadata; Outlook only reports a flag.
    Object.assign(documents[0], {
      attachments: [{ filename: "report.pdf" }],
    });
    Object.assign(documents[1], { hasAttachment: true });
    expect(search("has:attachment", documents)).toEqual(["outlook", "gmail"]);
    expect(search("-has:attachment", documents)).toEqual(["plain"]);
    expect(search("has:attachment quarterly", documents)).toEqual(["gmail"]);
    expect(search("has:attachment OR lunch", documents)).toEqual([
      "plain",
      "outlook",
      "gmail",
    ]);
  });
});
