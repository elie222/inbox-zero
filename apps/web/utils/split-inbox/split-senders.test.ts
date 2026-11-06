import { describe, expect, it } from "vitest";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { MAX_SPLIT_FILTERS } from "@/utils/split-inbox/split-filters";
import {
  addSendersToSplitFilters,
  canAddSendersToSplit,
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
