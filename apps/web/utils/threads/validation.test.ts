import { describe, expect, it } from "vitest";
import {
  threadsQuery,
  threadsQueryToSearchParams,
} from "@/utils/threads/validation";

describe("threadsQueryToSearchParams", () => {
  it("survives a round trip through the query string", () => {
    const anyOf = [
      { fromEmail: "notifications@linear.app" },
      { labelId: "Label_1" },
    ];
    const params = threadsQueryToSearchParams({
      labelIds: ["INBOX"],
      anyOf,
    });

    // String(anyOf) would silently send "[object Object]", which the route then
    // drops — leaving a "match any" split showing the whole inbox.
    expect(params.get("anyOf")).toBe(JSON.stringify(anyOf));
    expect(threadsQuery.parse({ anyOf: params.get("anyOf") }).anyOf).toEqual(
      anyOf,
    );
  });

  it("omits the parameter entirely when there are no branches", () => {
    expect(
      threadsQueryToSearchParams({ labelIds: ["INBOX"] }).has("anyOf"),
    ).toBe(false);
    expect(
      threadsQueryToSearchParams({ labelIds: ["INBOX"], anyOf: [] }).has(
        "anyOf",
      ),
    ).toBe(false);
  });

  it("rejects malformed conditions instead of showing the entire inbox", () => {
    expect(threadsQuery.safeParse({ anyOf: "not json" }).success).toBe(false);
  });
});

it.each([
  { anyOf: [{}] },
  { anyOf: [{ unknown: true }] },
  { anyOf: [{ labelId: "" }] },
  { anyOf: [{ labelId: "one", fromEmail: "sender@example.com" }] },
  { q: "search", anyOf: [{ isUnread: true }] },
  { type: "sent", anyOf: [{ isUnread: true }] },
])("rejects ambiguous split queries: %j", (query) => {
  expect(threadsQuery.safeParse(query).success).toBe(false);
});

it("round-trips Other exclusions and rejects unsupported query combinations", () => {
  const excludeSplits = [
    {
      matchAll: true,
      filters: [{ kind: "LABEL" as const, value: "newsletter" }],
    },
  ];
  const params = threadsQueryToSearchParams({ type: "inbox", excludeSplits });
  expect(
    threadsQuery.parse({
      type: "inbox",
      excludeSplits: params.get("excludeSplits"),
    }).excludeSplits,
  ).toEqual(excludeSplits);
  expect(
    threadsQuery.safeParse({ type: "inbox", excludeSplits: "invalid" }).success,
  ).toBe(false);
  expect(threadsQuery.safeParse({ type: "sent", excludeSplits }).success).toBe(
    false,
  );
  expect(
    threadsQuery.safeParse({ type: "inbox", q: "search", excludeSplits })
      .success,
  ).toBe(false);
});

it.each([
  { isUnread: true },
  { labelIds: ["STARRED"] },
  { labelId: "STARRED" },
  { fromEmail: "sender@example.com" },
  { after: new Date() },
  { before: new Date() },
  { excludeLabelNames: ["Newsletter"] },
])("rejects extra predicates in Other queries: %j", (predicate) => {
  expect(
    threadsQuery.safeParse({
      type: "inbox",
      excludeSplits: [{ matchAll: true, filters: [{ kind: "UNREAD" }] }],
      ...predicate,
    }).success,
  ).toBe(false);
});
