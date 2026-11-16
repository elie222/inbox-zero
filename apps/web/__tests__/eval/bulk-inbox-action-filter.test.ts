import { afterAll, describe, expect, test } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { getMockMessage } from "@/__tests__/helpers";
import { aiFilterEmailsForBulkAction } from "@/utils/ai/bulk-inbox-action/filter-emails";
import type { ParsedMessage } from "@/utils/types";

// pnpm --filter inbox-zero-ai test-ai eval/bulk-inbox-action-filter
// Multi-model: EVAL_MODELS=all pnpm --filter inbox-zero-ai test-ai eval/bulk-inbox-action-filter

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;

const evalReporter = createEvalReporter({
  evalName: "bulk-inbox-action-filter",
});

const mailbox = [
  email("newsletter", {
    from: "Tech Weekly <newsletter@techweekly.example>",
    subject: "This week in tech: chips, phones and policy",
    content:
      "The top stories you missed this week. Read online. Unsubscribe from this list.",
  }),
  email("promotion", {
    from: "Deals Daily <deals@shop.example>",
    subject: "Flash sale: 70% off this weekend only",
    content:
      "Shop the biggest sale of the season before it ends Sunday. Unsubscribe.",
  }),
  email("colleague", {
    from: "Dana Levi <dana@partner.example>",
    subject: "Contract redlines for Thursday",
    content:
      "Hi, I went through the contract and left comments on sections 3 and 5. Can we talk Thursday before the call?",
  }),
  email("invoice", {
    from: "Billing <billing@vendor.example>",
    subject: "Invoice INV-2207 for October",
    content:
      "Your invoice for October is attached. Payment is due within 30 days.",
  }),
  email("shipping", {
    from: "Acme Shipping <shipping@acme.example>",
    subject: "Your order has shipped",
    content:
      "Your package is on its way and should arrive Tuesday. Track your delivery.",
  }),
];

const cases = [
  {
    name: "newsletters and promotions only",
    instruction: "Newsletters and promotional emails",
    expected: ["newsletter", "promotion"],
  },
  {
    name: "excludes what the instruction protects",
    instruction:
      "Automated emails from companies, but keep anything about an invoice or payment",
    expected: ["newsletter", "promotion", "shipping"],
  },
];

describe.runIf(shouldRunEval)("Eval: bulk inbox action filter", () => {
  describeEvalMatrix("bulk inbox action filter", (model, emailAccount) => {
    test.each(cases)(
      "$name",
      async ({ name, instruction, expected }) => {
        const { matchingIds } = await aiFilterEmailsForBulkAction({
          emailAccount,
          instruction,
          messages: mailbox,
        });

        const actual = [...matchingIds].sort();
        const pass = actual.join(",") === [...expected].sort().join(",");

        evalReporter.record({
          testName: name,
          model: model.label,
          pass,
          expected: expected.join(", "),
          actual: actual.join(", ") || "(none)",
        });

        expect(actual).toEqual([...expected].sort());
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function email(
  id: string,
  {
    from,
    subject,
    content,
  }: { from: string; subject: string; content: string },
): ParsedMessage {
  return getMockMessage({
    id,
    threadId: `thread-${id}`,
    from,
    subject,
    snippet: content,
    textPlain: content,
    textHtml: `<p>${content}</p>`,
    labelIds: ["INBOX", "UNREAD"],
  }) as ParsedMessage;
}
