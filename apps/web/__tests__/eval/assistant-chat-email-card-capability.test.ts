import { afterAll, describe, expect, test } from "vitest";
import { captureAssistantChatTrace } from "@/__tests__/eval/assistant-chat-eval-utils";
import {
  setupInboxWorkflowEval,
  shouldRunEval,
  TIMEOUT,
} from "@/__tests__/eval/assistant-chat-inbox-workflows-test-utils";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { judgeEvalOutput } from "@/__tests__/eval/semantic-judge";
import { createScopedLogger } from "@/utils/logger";

// pnpm --filter inbox-zero-ai test-ai eval/assistant-chat-email-card-capability

const reporter = createEvalReporter({
  evalName: "assistant-chat-email-card-capability",
});
const logger = createScopedLogger("eval-assistant-chat-email-card-capability");

describe.runIf(shouldRunEval)("Eval: email card capability", () => {
  setupInboxWorkflowEval();

  describeEvalMatrix("email card capability", (model, emailAccount) => {
    test.each([
      { supportsInlineEmailCards: false, hasCardHistory: false },
      { supportsInlineEmailCards: false, hasCardHistory: true },
      { supportsInlineEmailCards: true, hasCardHistory: false },
      { supportsInlineEmailCards: true, hasCardHistory: true },
    ])(
      "formats email summaries for support=$supportsInlineEmailCards, history=$hasCardHistory",
      async ({ supportsInlineEmailCards, hasCardHistory }) => {
        const userPrompt =
          "Summarize my latest emails with a short note for each.";
        const trace = await captureAssistantChatTrace({
          emailAccount,
          logger,
          supportsInlineEmailCards,
          messages: [
            ...(hasCardHistory
              ? [
                  { role: "user" as const, content: "Summarize my inbox." },
                  {
                    role: "assistant" as const,
                    content:
                      '<emails><email threadid="thread-old" action="none">Review the update.</email></emails>',
                  },
                ]
              : []),
            { role: "user", content: userPrompt },
          ],
        });
        const output = trace.stepTexts.join("\n");
        const judgement = await judgeEvalOutput({
          input: userPrompt,
          output,
          expected: supportsInlineEmailCards
            ? "Summarizes the retrieved emails using inline email cards."
            : "Summarizes the retrieved emails in readable markdown without custom email card markup, even if previous replies used cards.",
          criterion: {
            name: "Client-compatible email formatting",
            description:
              "The response provides useful email summaries in the representation the current client supports.",
          },
        });
        const hasCardMarkup = /<\/?(?:emails|email|email-detail)\b/i.test(
          output,
        );
        const pass =
          judgement.pass && hasCardMarkup === supportsInlineEmailCards;
        reporter.record({
          testName: `email summaries (support=${supportsInlineEmailCards}, history=${hasCardHistory})`,
          model: model.label,
          pass,
          actual: output,
        });

        expect(pass, judgement.reasoning).toBe(true);
      },
      TIMEOUT,
    );
  });

  afterAll(() => reporter.printReport());
});
