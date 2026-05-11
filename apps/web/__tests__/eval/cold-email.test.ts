import { afterAll, describe, expect, test } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";

// pnpm test-ai eval/cold-email
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/cold-email

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;

const testCases = [
  {
    name: "third-party introduction is not cold",
    email: getEmail({
      from: "claire@example.com",
      to: "alice@example.com, bob@example.com",
      subject: "Intro: Alice <> Bob",
      content: `Hi Alice and Bob,

Good speaking with both of you earlier.

Alice is building workflow software for operations teams.
Bob leads a firm that works with companies in that space.

Thought it would be useful to connect you two directly.

Best,
Claire`,
      date: new Date("2026-04-21T10:00:00Z"),
    }),
    expectedColdEmail: false,
  },
  {
    name: "direct service pitch is cold",
    email: getEmail({
      from: "growth@agency.example",
      subject: "Can we help your team ship faster?",
      content: `Hi there,

We help software teams move faster with product design, engineering, and recruiting support.

Would you be open to a quick call next week to see if we can help?`,
      date: new Date("2026-04-21T10:00:00Z"),
    }),
    expectedColdEmail: true,
  },
];

describe.runIf(shouldRunEval)("Eval: cold email", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("cold email", (model, emailAccount) => {
    for (const testCase of testCases) {
      test(
        testCase.name,
        async () => {
          const result = await isColdEmail({
            email: testCase.email,
            emailAccount,
            provider: {
              hasPreviousCommunicationsWithSenderOrDomain: async () => false,
            } as any,
            coldEmailRule: null,
          });

          const actual = String(result.isColdEmail);
          const expected = String(testCase.expectedColdEmail);
          const pass = result.isColdEmail === testCase.expectedColdEmail;

          evalReporter.record({
            testName: testCase.name,
            model: model.label,
            pass,
            actual,
            expected,
          });

          expect(result.isColdEmail).toBe(testCase.expectedColdEmail);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
