import { describe, expect, test } from "vitest";
import { saasFounderMixedInbox } from "@/__tests__/fixtures/inboxes/demo-inboxes";
import {
  buildRuleFixtureRow,
  searchFixtureMessages,
  toGmailSeedMessages,
  toMockMessages,
  toRuleRows,
} from "@/__tests__/fixtures/inboxes/adapters";
import { ActionType } from "@/generated/prisma/enums";

describe("demo inbox fixture adapters", () => {
  test("converts every fixture message into Gmail seed data", () => {
    const seedMessages = toGmailSeedMessages(saasFounderMixedInbox);
    const fixtureMessageCount = saasFounderMixedInbox.threads.reduce(
      (count, thread) => count + thread.messages.length,
      0,
    );

    expect(seedMessages).toHaveLength(fixtureMessageCount);
    expect(seedMessages).toContainEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^[a-f0-9]{16}$/),
        user_email: saasFounderMixedInbox.mailbox.email,
        from: "AWS Security <no-reply-aws@amazon.com>",
        subject: "Root MFA disabled on production account",
        label_ids: expect.arrayContaining(["INBOX", "UNREAD"]),
      }),
    );
  });

  test("converts fixture messages into ParsedMessage-like test messages", () => {
    const messages = toMockMessages(saasFounderMixedInbox);
    const customerMessage = messages.find(
      (message) =>
        message.subject === "Escalation: renewal terms still unresolved",
    );

    expect(customerMessage).toEqual(
      expect.objectContaining({
        threadId: expect.stringMatching(/^[a-f0-9]{16}$/),
        subject: "Escalation: renewal terms still unresolved",
        textPlain: expect.stringContaining("procurement will pause"),
        labelIds: expect.arrayContaining(["INBOX", "UNREAD"]),
      }),
    );
  });

  test("searches fixture messages by common Gmail-style query terms", () => {
    const productUpdates = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "in:inbox product update",
      maxResults: 10,
    });
    const unreadSecurity = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "is:unread security",
      maxResults: 10,
    });

    expect(productUpdates.messages.map((message) => message.subject)).toEqual(
      expect.arrayContaining([
        "What's new in Notion this month",
        "Vercel product update: new observability features",
      ]),
    );
    expect(unreadSecurity.messages.map((message) => message.subject)).toEqual(
      expect.arrayContaining([
        "Root MFA disabled on production account",
        "New suspicious login detected",
      ]),
    );
  });

  test("preserves internal hyphens while dropping negative search terms", () => {
    const followUp = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "follow-up",
      maxResults: 10,
    });
    const deployment = searchFixtureMessages({
      fixture: saasFounderMixedInbox,
      query: "inbox-zero-ai -security",
      maxResults: 10,
    });

    expect(followUp.messages.map((message) => message.subject)).toContain(
      "Follow-up on Q2 metrics",
    );
    expect(deployment.messages.map((message) => message.subject)).toContain(
      "Production deployment succeeded",
    );
  });

  test("builds default system rules alongside eval-provided rules", () => {
    const rules = toRuleRows({
      rules: [
        {
          name: "VIP Customers",
          instructions:
            "Emails from active enterprise customers that need same-day attention.",
          actions: [{ type: ActionType.LABEL, label: "VIP Customer" }],
        },
      ],
    });

    expect(rules.map((rule) => rule.name)).toEqual(
      expect.arrayContaining(["To Reply", "Newsletter", "VIP Customers"]),
    );
    expect(
      buildRuleFixtureRow({
        name: "Security",
        instructions: "Security alerts.",
        actions: [{ type: ActionType.LABEL, label: "Security" }],
      }).actions,
    ).toEqual([
      expect.objectContaining({ type: ActionType.LABEL, label: "Security" }),
    ]);
  });
});
