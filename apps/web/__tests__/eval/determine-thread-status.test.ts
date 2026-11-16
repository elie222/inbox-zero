import { afterAll, describe, expect, test } from "vitest";
import { getEmail } from "@/__tests__/helpers";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { SystemType } from "@/generated/prisma/enums";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";

// pnpm test-ai eval/determine-thread-status

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const STUDIO_ALIAS = "studio@brightline-photo.test";

describe.runIf(shouldRunEval)("Eval: determine thread status", () => {
  const evalReporter = createEvalReporter({
    evalName: "determine-thread-status",
  });

  describeEvalMatrix("determine-thread-status", (model, emailAccount) => {
    test(
      "marks handled renewal cancellation thread as ACTIONED",
      async () => {
        const result = await aiDetermineThreadStatus({
          emailAccount,
          userSentLastEmail: true,
          threadMessages: getHandledRenewalCancellationThread(
            emailAccount.email,
          ),
        });

        const actual = result.status;
        const pass = actual === SystemType.ACTIONED;

        evalReporter.record({
          testName: "handled renewal cancellation thread",
          model: model.label,
          pass,
          actual,
          expected: SystemType.ACTIONED,
        });

        expect(actual).toBe(SystemType.ACTIONED);
      },
      TIMEOUT,
    );

    test(
      "keeps explicit future follow-up promise as TO_REPLY",
      async () => {
        const result = await aiDetermineThreadStatus({
          emailAccount,
          userSentLastEmail: true,
          threadMessages: [
            getEmail({
              from: emailAccount.email,
              to: "customer@example.com",
              subject: "Re: Updated deck",
              content:
                "I'll send the revised deck with the pricing changes tomorrow morning.",
            }),
          ],
        });

        const actual = result.status;
        const pass = actual === SystemType.TO_REPLY;

        evalReporter.record({
          testName: "explicit future follow-up promise",
          model: model.label,
          pass,
          actual,
          expected: SystemType.TO_REPLY,
        });

        expect(actual).toBe(SystemType.TO_REPLY);
      },
      TIMEOUT,
    );

    test(
      "prioritizes latest concrete scheduling confirmation as TO_REPLY",
      async () => {
        const result = await aiDetermineThreadStatus({
          emailAccount,
          userSentLastEmail: false,
          threadMessages: getSchedulingConfirmationWithOlderOpenQuestionThread(
            emailAccount.email,
          ),
        });

        const actual = result.status;
        const pass = actual === SystemType.TO_REPLY;

        evalReporter.record({
          testName: "scheduling confirmation with older open question",
          model: model.label,
          pass,
          actual,
          expected: SystemType.TO_REPLY,
        });

        expect(actual).toBe(SystemType.TO_REPLY);
      },
      TIMEOUT,
    );

    test(
      "treats another participant answer as handled",
      async () => {
        const result = await aiDetermineThreadStatus({
          emailAccount,
          userSentLastEmail: false,
          threadMessages: getThirdPartyAnsweredQuestionThread(
            emailAccount.email,
          ),
        });

        const actual = result.status;
        const pass = actual === SystemType.ACTIONED;

        evalReporter.record({
          testName: "third party answered question",
          model: model.label,
          pass,
          actual,
          expected: SystemType.ACTIONED,
        });

        expect(actual).toBe(SystemType.ACTIONED);
      },
      TIMEOUT,
    );

    test(
      "treats a question the user sent from an alias as AWAITING_REPLY",
      async () => {
        const result = await aiDetermineThreadStatus({
          emailAccount,
          userSentLastEmail: true,
          threadMessages: getAliasQuoteThread(),
        });

        const actual = result.status;
        const pass = actual === SystemType.AWAITING_REPLY;

        evalReporter.record({
          testName: "alias reply asks client a question",
          model: model.label,
          pass,
          actual,
          expected: SystemType.AWAITING_REPLY,
        });

        expect(actual).toBe(SystemType.AWAITING_REPLY);
      },
      TIMEOUT,
    );

    test(
      "treats a request the user fulfilled from an alias as ACTIONED",
      async () => {
        const result = await aiDetermineThreadStatus({
          emailAccount,
          userSentLastEmail: true,
          threadMessages: getAliasInvoiceThread(),
        });

        const actual = result.status;
        const pass = actual === SystemType.ACTIONED;

        evalReporter.record({
          testName: "alias reply fulfils request",
          model: model.label,
          pass,
          actual,
          expected: SystemType.ACTIONED,
        });

        expect(actual).toBe(SystemType.ACTIONED);
      },
      TIMEOUT,
    );
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getHandledRenewalCancellationThread(userEmail: string) {
  return [
    getEmail({
      from: "customer@example.com",
      to: userEmail,
      subject: "Please stop the renewal charge",
      content: "Please stop trying to charge for renewal.",
    }),
    getEmail({
      from: userEmail,
      to: "customer@example.com",
      subject: "Re: Please stop the renewal charge",
      content:
        "Really sorry about that. I'll make sure the renewal is cancelled.",
    }),
  ];
}

function getSchedulingConfirmationWithOlderOpenQuestionThread(
  userEmail: string,
) {
  return [
    getEmail({
      from: userEmail,
      to: "colleague@example.com",
      subject: "Project review",
      content:
        "Could you send the technical notes from the earlier review? Also, once we pick a time for today, I will send the calendar invite.",
    }),
    getEmail({
      from: "colleague@example.com",
      to: userEmail,
      subject: "Re: Project review",
      content:
        "Let's aim for 1 pm Pacific today. I also tweaked the prototype over the weekend.",
    }),
  ];
}

function getThirdPartyAnsweredQuestionThread(userEmail: string) {
  return [
    getEmail({
      from: "customer@example.com",
      to: `${userEmail}, support@example.com`,
      subject: "Access request",
      content:
        "Can someone confirm whether the staging credentials still work for tomorrow's review?",
    }),
    getEmail({
      from: "support@example.com",
      to: "customer@example.com",
      cc: userEmail,
      subject: "Re: Access request",
      content:
        "I checked the staging credentials and confirmed they work. I also sent the updated link for tomorrow's review.",
    }),
    getEmail({
      from: "customer@example.com",
      to: "support@example.com",
      cc: userEmail,
      subject: "Re: Access request",
      content: "Thanks, that answers my question.",
    }),
  ];
}

function getAliasQuoteThread() {
  return [
    getEmail({
      from: "client@example.com",
      to: STUDIO_ALIAS,
      subject: "Quote for the March shoot",
      content:
        "Hi, could you send a quote for a full-day product shoot in March?",
    }),
    getEmail({
      from: `Brightline Studio <${STUDIO_ALIAS}>`,
      to: "client@example.com",
      subject: "Re: Quote for the March shoot",
      content:
        "Thanks for reaching out. A full day is $2,400 including editing. Would you like me to hold March 14 for you?",
    }),
  ];
}

function getAliasInvoiceThread() {
  return [
    getEmail({
      from: "client@example.com",
      to: STUDIO_ALIAS,
      subject: "Last month's invoice",
      content:
        "Could you resend last month's invoice? Our finance team can't find it.",
    }),
    getEmail({
      from: `Brightline Studio <${STUDIO_ALIAS}>`,
      to: "client@example.com",
      subject: "Re: Last month's invoice",
      content: "Of course, I've attached last month's invoice again.",
    }),
  ];
}
