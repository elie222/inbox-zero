import { describe, expect, it } from "vitest";
import { threadsQueryToPredicate } from "./threads-query";

describe("threadsQueryToPredicate", () => {
  it("maps unread inbox queries onto a same-message all-predicate", () => {
    expect(threadsQueryToPredicate({ type: "unread" })).toEqual({
      kind: "all",
      predicates: [
        { kind: "role", role: "inbox" },
        { kind: "read", value: false },
      ],
    });
  });

  it("maps free-text search to a text predicate", () => {
    expect(threadsQueryToPredicate({ q: "invoice" })).toEqual({
      kind: "text",
      field: "any",
      value: "invoice",
      match: "phrase",
    });
  });

  it("maps subject and from operators onto structured predicates", () => {
    expect(
      threadsQueryToPredicate({
        q: 'from:alice@example.com subject:"Archive Action Message" has:attachment',
      }),
    ).toEqual({
      kind: "all",
      predicates: [
        {
          kind: "text",
          field: "subject",
          value: "Archive Action Message",
          match: "phrase",
        },
        {
          kind: "address",
          field: "from",
          value: "alice@example.com",
          match: "address",
        },
        { kind: "has_attachment", value: true },
      ],
    });
  });
});
