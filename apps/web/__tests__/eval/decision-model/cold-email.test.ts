import { afterAll, describe, test } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { checkColdEmailWithLlm } from "@/utils/cold-email/is-cold-email";
import { decideColdEmail } from "@/utils/decision-model/cold-email";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

const cases = [
  {
    name: "generic sales outreach",
    expected: true,
    email: getEmail({
      from: "sales@agency.example",
      to: lunaEmailAccount.email,
      subject: "Can we grow your pipeline?",
      content:
        "We have never met, but our agency can book qualified meetings for your company. Want a sales call?",
    }),
  },
  {
    name: "unsolicited service pitch",
    expected: true,
    email: getEmail({
      from: "founder@outsourcing.example",
      to: lunaEmailAccount.email,
      subject: "Engineering capacity this quarter",
      content:
        "I found your company online. We provide outsourced engineers and would love to sell you a development team.",
    }),
  },
  {
    name: "subscribed newsletter",
    expected: false,
    email: getEmail({
      from: "digest@publication.example",
      to: lunaEmailAccount.email,
      subject: "This week's engineering digest",
      content: "Here are this week's top engineering stories.",
      listUnsubscribe: "https://publication.example/unsubscribe",
    }),
  },
  {
    name: "transactional receipt",
    expected: false,
    email: getEmail({
      from: "billing@merchant.example",
      to: lunaEmailAccount.email,
      subject: "Receipt for order #1234",
      content: "Payment received. Your total was $29.00.",
    }),
  },
  {
    name: "specific valuable opportunity",
    expected: false,
    email: getEmail({
      from: "editor@known-publication.example",
      to: lunaEmailAccount.email,
      subject: "Interview request about Inbox Zero",
      content:
        "I'm writing a named profile about Inbox Zero for our publication and would like to interview you about the product next Tuesday.",
    }),
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model cold email",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-cold-email",
    });

    for (const testCase of cases) {
      test(
        testCase.name,
        async () => {
          await compareDecision({
            testName: testCase.name,
            expected: testCase.expected,
            runJev: async () =>
              (
                await decideColdEmail({
                  config: decisionModelConfig,
                  email: testCase.email,
                  emailAccount: lunaEmailAccount,
                  coldEmailRule: null,
                  logger: decisionModelEvalLogger,
                })
              ).coldEmail,
            runLuna: async () =>
              (
                await checkColdEmailWithLlm({
                  email: testCase.email,
                  emailAccount: lunaEmailAccount,
                  coldEmailRule: null,
                  logger: decisionModelEvalLogger,
                })
              ).isColdEmail,
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    afterAll(() => reporter.printReport());
  },
);
