import { describe, expect, it } from "vitest";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { MAX_SPLIT_FILTERS } from "@/utils/split-inbox/split-filters";
import {
  addSendersToSplitFilters,
  canAddSendersToSplit,
  getThreadSenders,
} from "@/utils/split-inbox/split-senders";

const from = (value: string) => ({ kind: MailSplitFilterKind.FROM, value });
const label = (value: string) => ({ kind: MailSplitFilterKind.LABEL, value });

describe("canAddSendersToSplit", () => {
  it("accepts match-any, single-condition, and sender-only splits", () => {
    expect(
      canAddSendersToSplit({ matchAll: true, filters: [label("Label_1")] }),
    ).toBe(true);
    expect(
      canAddSendersToSplit({ matchAll: false, filters: [label("Label_1")] }),
    ).toBe(true);
    expect(
      canAddSendersToSplit({ matchAll: true, filters: [from("a@x.com")] }),
    ).toBe(true);
  });

  it("rejects the plain inbox and match-all splits with other conditions", () => {
    expect(canAddSendersToSplit({ matchAll: true, filters: [] })).toBe(false);
    expect(
      canAddSendersToSplit({
        matchAll: true,
        filters: [label("Label_1"), from("a@x.com")],
      }),
    ).toBe(false);
  });
});

describe("addSendersToSplitFilters", () => {
  it("adds new senders and switches a single-sender split to match any", () => {
    const result = addSendersToSplitFilters(
      { matchAll: true, filters: [from("a@x.com")] },
      ["b@y.com", "c@z.com"],
    );

    expect(result).toEqual({
      status: "ok",
      added: ["b@y.com", "c@z.com"],
      matchAll: false,
      filters: [from("a@x.com"), from("b@y.com"), from("c@z.com")],
    });
  });

  it("skips senders the split already covers, including by domain", () => {
    const result = addSendersToSplitFilters(
      { matchAll: false, filters: [from("A@x.com"), from("@news.com")] },
      ["a@X.com", "weekly@news.com", "b@y.com", "B@y.com"],
    );

    expect(result).toMatchObject({ status: "ok", added: ["b@y.com"] });
  });

  it("leaves the split as it was when every sender is already covered", () => {
    const result = addSendersToSplitFilters(
      { matchAll: true, filters: [from("a@x.com")] },
      ["A@x.com"],
    );

    expect(result).toEqual({
      status: "ok",
      added: [],
      matchAll: true,
      filters: [from("a@x.com")],
    });
  });

  it("refuses to change a match-all split that has several other conditions", () => {
    expect(
      addSendersToSplitFilters(
        {
          matchAll: true,
          filters: [label("Label_1"), { kind: "UNREAD", value: null }],
        },
        ["a@x.com"],
      ),
    ).toEqual({ status: "incompatible" });
  });

  it("widens a single-label split to also match the new sender", () => {
    expect(
      addSendersToSplitFilters(
        { matchAll: true, filters: [label("Label_1")] },
        ["a@x.com"],
      ),
    ).toMatchObject({ status: "ok", matchAll: false });
  });

  it("refuses to go past the condition limit", () => {
    const existing = Array.from({ length: MAX_SPLIT_FILTERS - 1 }, (_, i) =>
      from(`s${i}@x.com`),
    );

    expect(
      addSendersToSplitFilters({ matchAll: false, filters: existing }, [
        "new1@y.com",
        "new2@y.com",
      ]),
    ).toEqual({ status: "limit" });
  });
});

describe("getThreadSenders", () => {
  const thread = (...senders: string[]) =>
    senders.map((from) => ({ headers: { from } }));

  it("picks the latest sender who isn't the user or one of their aliases", () => {
    expect(
      getThreadSenders(
        [
          thread("Leah <leah@x.com>", "Me <me@example.com>"),
          thread("Sam <sam@y.com>", "Alias <sales@example.com>"),
          thread("me@example.com"),
        ],
        ["me@example.com", "Sales@example.com"],
      ),
    ).toEqual(["leah@x.com", "sam@y.com"]);
  });

  it("goes by message date rather than array order", () => {
    expect(
      getThreadSenders(
        [
          [
            { headers: { from: "new@x.com" }, internalDate: "2000" },
            { headers: { from: "old@y.com" }, internalDate: "1000" },
          ],
        ],
        ["me@example.com"],
      ),
    ).toEqual(["new@x.com"]);
  });

  it("goes by array order when a message has no date", () => {
    expect(
      getThreadSenders(
        [
          [
            { headers: { from: "old@y.com" }, internalDate: "1000" },
            { headers: { from: "new@x.com" } },
          ],
        ],
        ["me@example.com"],
      ),
    ).toEqual(["new@x.com"]);
  });

  it("skips malformed addresses and deduplicates", () => {
    expect(
      getThreadSenders(
        [thread("not an address"), thread("A@x.com"), thread("a@x.com")],
        ["me@example.com"],
      ),
    ).toEqual(["a@x.com"]);
  });

  it("falls back to an earlier valid sender when the latest is malformed", () => {
    expect(
      getThreadSenders(
        [
          [
            { headers: { from: "old@y.com" }, internalDate: "1000" },
            { headers: { from: "not an address" } },
          ],
        ],
        ["me@example.com"],
      ),
    ).toEqual(["old@y.com"]);
  });
});
