import { ActionType } from "@/generated/prisma/enums";
import type { DemoInboxFixture } from "@/__tests__/fixtures/inboxes/types";
import { saasFounderMixedInbox } from "@/__tests__/fixtures/inboxes/demo-inboxes";
import type { DemoRuleFixture } from "@/__tests__/fixtures/inboxes/adapters";

export type AssistantRuleSuggestionFixture = {
  inbox: DemoInboxFixture;
  account: {
    email: string;
    timezone: string;
    about: string;
  };
  rules: DemoRuleFixture[];
};

export const saasFounderRuleSuggestionFixture: AssistantRuleSuggestionFixture =
  {
    inbox: saasFounderMixedInbox,
    account: {
      email: saasFounderMixedInbox.mailbox.email,
      timezone: saasFounderMixedInbox.mailbox.timezone,
      about:
        "I run a B2B SaaS company and want important customer, security, billing, and compliance mail surfaced quickly.",
    },
    rules: [
      {
        name: "VIP Customers",
        instructions:
          "Emails from active enterprise customers that need same-day attention.",
        runOnThreads: true,
        actions: [{ type: ActionType.LABEL, label: "VIP Customer" }],
      },
    ],
  };
