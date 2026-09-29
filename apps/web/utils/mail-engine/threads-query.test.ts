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

  it("maps Outlook inbox sections onto an inbox section predicate", () => {
    expect(
      threadsQueryToPredicate({ type: "inbox", inboxSection: "focused" }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "mailbox", mailbox: "inbox" },
        { kind: "inbox_section", section: "focused" },
      ],
    });
  });

  it("maps match-any Outlook inbox section leaves without treating them as unread", () => {
    expect(
      threadsQueryToPredicate({
        type: "inbox",
        anyOf: [{ inboxSection: "other" }],
      }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "mailbox", mailbox: "inbox" },
        {
          kind: "any",
          predicates: [{ kind: "inbox_section", section: "other" }],
        },
      ],
    });
  });

  it("maps Gmail category types onto category membership", () => {
    expect(threadsQueryToPredicate({ type: "CATEGORY_PROMOTIONS" })).toEqual({
      kind: "membership",
      membership: "category",
      id: "CATEGORY_PROMOTIONS",
    });
  });

  it("maps split labelIds onto the same-message inbox and category predicates", () => {
    expect(
      threadsQueryToPredicate({
        labelIds: ["INBOX", "CATEGORY_PROMOTIONS"],
      }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "role", role: "inbox" },
        {
          kind: "membership",
          membership: "category",
          id: "CATEGORY_PROMOTIONS",
        },
      ],
    });
  });

  it("maps starred split labelIds onto the starred flag, not a STARRED label", () => {
    expect(threadsQueryToPredicate({ labelIds: ["INBOX", "STARRED"] })).toEqual(
      {
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          { kind: "starred", value: true },
        ],
      },
    );
  });

  it("ORs anyLabelIds on top of required inbox membership", () => {
    expect(
      threadsQueryToPredicate({
        labelIds: ["INBOX"],
        anyLabelIds: ["Label_users", "Label_customers"],
      }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "role", role: "inbox" },
        {
          kind: "any",
          predicates: [
            { kind: "membership", membership: "label", id: "Label_users" },
            { kind: "membership", membership: "label", id: "Label_customers" },
          ],
        },
      ],
    });
  });

  it("excludes Gmail category splits from Other using category membership", () => {
    expect(
      threadsQueryToPredicate({
        type: "inbox",
        excludeSplits: [
          {
            matchAll: true,
            filters: [{ kind: "CATEGORY", value: "CATEGORY_PROMOTIONS" }],
          },
        ],
      }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "mailbox", mailbox: "inbox" },
        {
          kind: "not",
          predicate: {
            kind: "any",
            predicates: [
              {
                kind: "all",
                predicates: [
                  {
                    kind: "membership",
                    membership: "category",
                    id: "CATEGORY_PROMOTIONS",
                  },
                ],
              },
            ],
          },
        },
      ],
    });
  });

  it("maps free-text search to a text predicate", () => {
    expect(threadsQueryToPredicate({ q: "invoice" })).toEqual({
      kind: "text",
      field: "any",
      value: "invoice",
      match: "term",
    });
  });

  it("maps subject, from and to operators onto structured predicates", () => {
    expect(
      threadsQueryToPredicate({
        q: 'from:alice@example.com to:bob@example.com subject:"Archive Action Message" has:attachment invoice',
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
        {
          kind: "address",
          field: "to",
          value: "bob@example.com",
          match: "address",
        },
        { kind: "has_attachment", value: true },
        { kind: "text", field: "any", value: "invoice", match: "term" },
      ],
    });
  });

  it("maps a repeated operator onto one predicate per value", () => {
    expect(
      threadsQueryToPredicate({
        q: "to:ada@example.com to:grace@example.com",
      }),
    ).toEqual({
      kind: "all",
      predicates: [
        {
          kind: "address",
          field: "to",
          value: "ada@example.com",
          match: "address",
        },
        {
          kind: "address",
          field: "to",
          value: "grace@example.com",
          match: "address",
        },
      ],
    });
  });
});
