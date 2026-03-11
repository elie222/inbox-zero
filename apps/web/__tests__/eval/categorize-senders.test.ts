import { describe, test, expect, vi, afterAll } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { evalReporter } from "@/__tests__/eval/reporter";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { defaultCategory } from "@/utils/categories";

// pnpm test-ai eval/categorize-senders
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/categorize-senders

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 30_000;

const testCases = [
  {
    sender: "newsletter@company.com",
    emails: [
      { subject: "Latest updates and news from our company", snippet: "" },
    ],
    expected: "Newsletter",
  },
  {
    sender: "support@service.com",
    emails: [{ subject: "Your ticket #1234 has been updated", snippet: "" }],
    expected: ["Support", "Notification"],
  },
  {
    sender: "sales@business.com",
    emails: [
      { subject: "Special offer: 20% off our enterprise plan", snippet: "" },
    ],
    expected: "Marketing",
  },
  {
    sender: "noreply@socialnetwork.com",
    emails: [{ subject: "John Smith mentioned you in a comment", snippet: "" }],
    expected: ["Social", "Notification"],
  },
];

describe.runIf(isAiTest)("Eval: Categorize Senders", () => {
  evalReporter.reset();

  describeEvalMatrix("categorize", (model, emailAccount) => {
    for (const tc of testCases) {
      const acceptable = Array.isArray(tc.expected)
        ? tc.expected
        : [tc.expected];
      const label = acceptable.join("|");

      test(
        `${tc.sender} → ${label}`,
        async () => {
          const result = await aiCategorizeSender({
            emailAccount,
            sender: tc.sender,
            previousEmails: tc.emails,
            categories: getCategories(),
          });

          const actual = result?.category ?? "none";
          const pass = acceptable.includes(actual);
          evalReporter.record({
            testName: `${tc.sender} → ${label}`,
            model: model.label,
            pass,
            expected: label,
            actual,
          });

          expect(acceptable).toContain(result?.category);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getCategories() {
  return Object.values(defaultCategory)
    .filter((c) => c.enabled)
    .map((c) => ({ name: c.name, description: c.description }));
}
