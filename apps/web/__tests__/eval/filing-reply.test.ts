import { afterAll, describe, expect, test } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiParseFilingReply } from "@/utils/ai/document-filing/parse-filing-reply";

// pnpm --filter inbox-zero-ai test-ai __tests__/eval/filing-reply.test.ts

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;

const filings = [
  { id: "filing-1", filename: "invoice.pdf", currentFolder: "Finance" },
  {
    id: "filing-2",
    filename: "quarterly-summary.pdf",
    currentFolder: "Reports",
  },
  { id: "filing-3", filename: "notes.txt", currentFolder: "Documents" },
];

describe.runIf(shouldRunEval)("filing reply eval", () => {
  const evalReporter = createEvalReporter({ evalName: "filing-reply" });

  describeEvalMatrix("filing reply", (model, emailAccount) => {
    const testCases = [
      {
        name: "targets one named document",
        reply: "Move quarterly-summary.pdf to Finance/Quarterly.",
        expected: [
          {
            filingId: "filing-2",
            action: "move",
            folderPath: "Finance/Quarterly",
          },
        ],
      },
      {
        name: "targets multiple named documents",
        reply:
          "Move invoice.pdf to Finance/Invoices and undo the filing for notes.txt.",
        expected: [
          {
            filingId: "filing-1",
            action: "move",
            folderPath: "Finance/Invoices",
          },
          { filingId: "filing-3", action: "undo", folderPath: null },
        ],
      },
      {
        name: "applies a clear batch-wide reply to every document",
        reply: "These all look good.",
        expected: filings.map((filing) => ({
          filingId: filing.id,
          action: "approve",
          folderPath: null,
        })),
      },
    ] as const;

    for (const testCase of testCases) {
      test(
        testCase.name,
        async () => {
          const result = await aiParseFilingReply({
            messages: [{ role: "user", content: testCase.reply }],
            filingContexts: filings,
            emailAccount,
          });
          const actual = sortActions(result.actions);
          const expected = sortActions([...testCase.expected]);
          const pass = JSON.stringify(actual) === JSON.stringify(expected);

          evalReporter.record({
            testName: testCase.name,
            model: model.label,
            pass,
            expected: JSON.stringify(expected),
            actual: JSON.stringify(actual),
          });

          expect(actual).toEqual(expected);
        },
        TIMEOUT,
      );
    }

    test(
      "does not guess when a multi-document reply is ambiguous",
      async () => {
        const result = await aiParseFilingReply({
          messages: [{ role: "user", content: "Move it to Archive." }],
          filingContexts: filings,
          emailAccount,
        });
        const pass = result.actions.length === 0 && result.reply.length > 0;

        evalReporter.record({
          testName: "does not guess when a multi-document reply is ambiguous",
          model: model.label,
          pass,
          expected: "no actions and a clarification reply",
          actual: JSON.stringify(result),
        });

        expect(result.actions).toEqual([]);
        expect(result.reply.length).toBeGreaterThan(0);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function sortActions<T extends { filingId: string }>(actions: T[]): T[] {
  return actions.toSorted((a, b) => a.filingId.localeCompare(b.filingId));
}
