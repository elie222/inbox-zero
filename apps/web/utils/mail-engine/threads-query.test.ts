import { describe, expect, it, vi } from "vitest";
import {
  type EffectiveMessage,
  messageMatchesPredicate,
} from "@inboxzero/mail-core/query-semantics";
import {
  mailSplitToThreadsQuery,
  otherMailSplitQuery,
} from "@/utils/split-inbox/split-query";
import { threadsQueryToPredicate } from "./threads-query";

describe("threadsQueryToPredicate", () => {
  it("keeps inbox mail sent to a recipient split's domain in that split, not Other", () => {
    const split = {
      id: "rakazo",
      name: "Rakazo",
      matchAll: true,
      filters: [{ kind: "TO" as const, value: "@rakazo.com" }],
    };
    const inSplit = threadsQueryToPredicate(mailSplitToThreadsQuery(split));
    const inMatchAny = threadsQueryToPredicate(
      mailSplitToThreadsQuery({
        ...split,
        matchAll: false,
        filters: [...split.filters, { kind: "FROM", value: "a@b.com" }],
      }),
    );
    const inOther = threadsQueryToPredicate(otherMailSplitQuery([split]));

    const ccRakazo = inboxMessage({ cc: ["Team <hello@rakazo.com>"] });
    const unrelated = inboxMessage({ to: ["me@example.com"] });
    for (const predicate of [inSplit, inMatchAny]) {
      expect(messageMatchesPredicate(ccRakazo, predicate)).toBe(true);
      expect(messageMatchesPredicate(unrelated, predicate)).toBe(false);
    }
    expect(messageMatchesPredicate(ccRakazo, inOther)).toBe(false);
    expect(messageMatchesPredicate(unrelated, inOther)).toBe(true);
  });

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

  it("excludes age splits by received date rather than as a label", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-08T00:00:00Z"));
    try {
      const predicate = threadsQueryToPredicate({
        type: "inbox",
        excludeSplits: [
          { matchAll: true, filters: [{ kind: "OLDER_THAN", value: "1w" }] },
        ],
      });
      expect(predicate).toEqual({
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
                      kind: "received",
                      afterMs: null,
                      beforeMs: new Date("2026-01-01T00:00:00Z").getTime(),
                    },
                  ],
                },
              ],
            },
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a user label's membership top-level when combined with other filters", () => {
    expect(
      threadsQueryToPredicate({ labelId: "Label_news", fromEmail: "a@x.com" }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "address", field: "from", value: "a@x.com", match: "address" },
        { kind: "membership", membership: "label", id: "Label_news" },
        { kind: "mailbox", mailbox: "all" },
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

  it.each([
    "to:ada@example.com to:grace@example.com",
    "(to:ada@example.com) (to:grace@example.com)",
    'to:"ada@example.com" to:"grace@example.com"',
  ])("extracts every recipient operator: %s", (q) => {
    expect(threadsQueryToPredicate({ q })).toEqual({
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

  it("leaves recipient operators inside quoted text in the phrase", () => {
    expect(
      threadsQueryToPredicate({
        q: 'to:ada@example.com "sent to:grace@example.com"',
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
          kind: "text",
          field: "any",
          value: '"sent to:grace@example.com"',
          match: "term",
        },
      ],
    });
  });

  it("maps the Outlook attachment operator onto the attachment predicate", () => {
    expect(threadsQueryToPredicate({ q: "hasattachments:true" })).toEqual({
      kind: "has_attachment",
      value: true,
    });
    expect(
      threadsQueryToPredicate({ q: "invoice hasattachments:yes" }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "has_attachment", value: true },
        { kind: "text", field: "any", value: "invoice", match: "term" },
      ],
    });
  });

  it("negates the attachment predicate for hasattachments:false", () => {
    expect(
      threadsQueryToPredicate({ q: "invoice hasattachments:false" }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "has_attachment", value: false },
        { kind: "text", field: "any", value: "invoice", match: "term" },
      ],
    });
  });

  it("keeps an attachment operator with an uninterpretable value as text", () => {
    expect(
      threadsQueryToPredicate({ q: "invoice hasattachments:maybe" }),
    ).toEqual({
      kind: "text",
      field: "any",
      value: "invoice hasattachments:maybe",
      match: "term",
    });
  });

  it("reads operators inside a parenthesized group without leaving the parens as text", () => {
    expect(threadsQueryToPredicate({ q: "(hasattachments:true)" })).toEqual({
      kind: "has_attachment",
      value: true,
    });
    expect(threadsQueryToPredicate({ q: "(subject:invoice)" })).toEqual({
      kind: "text",
      field: "subject",
      value: "invoice",
      match: "phrase",
    });
  });

  it("leaves operators inside a quoted phrase in the phrase", () => {
    expect(
      threadsQueryToPredicate({
        q: '"looking for hasattachments:true in email"',
      }),
    ).toEqual({
      kind: "text",
      field: "any",
      value: '"looking for hasattachments:true in email"',
      match: "term",
    });
  });

  it("keeps parens inside a quoted phrase", () => {
    expect(threadsQueryToPredicate({ q: '"invoice (paid)"' })).toEqual({
      kind: "text",
      field: "any",
      value: '"invoice (paid)"',
      match: "term",
    });
    expect(
      threadsQueryToPredicate({ q: '(hasattachments:true) "invoice (paid)"' }),
    ).toEqual({
      kind: "all",
      predicates: [
        { kind: "has_attachment", value: true },
        {
          kind: "text",
          field: "any",
          value: '"invoice (paid)"',
          match: "term",
        },
      ],
    });
  });
});

function inboxMessage(fields: Partial<EffectiveMessage>): EffectiveMessage {
  return {
    accountId: "acc-1",
    messageId: "m1",
    conversationId: "c1",
    subject: "Subject",
    preview: "Preview",
    from: "ada@example.com",
    to: [],
    cc: [],
    receivedAtMs: 1,
    read: false,
    starred: false,
    folderId: "inbox",
    inboxSection: null,
    roles: ["inbox"],
    labelIds: ["INBOX"],
    categoryIds: [],
    hasAttachments: false,
    pendingOperationIds: [],
    ...fields,
  };
}
