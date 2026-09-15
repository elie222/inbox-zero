import { afterAll, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { judgeBinary } from "@/__tests__/eval/judge";
import { getMockMessage } from "@/__tests__/helpers";
import { aiGenerateMeetingBriefing } from "@/utils/ai/meeting-briefs/generate-briefing";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/ai/mcp/mcp-tools", () => ({
  createMcpToolsForAgent: async () => ({ tools: {}, cleanup: async () => {} }),
}));
vi.mock("@/utils/ai/web-search", () => ({
  getWebSearchConfigForProvider: () => null,
}));
vi.mock("@/env", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/env")>();
  return { env: { ...original.env, PERPLEXITY_API_KEY: undefined } };
});

const logger = createScopedLogger("eval-meeting-briefing");
const reporter = createEvalReporter({ evalName: "meeting-briefing" });
const scenarios = [
  {
    name: "prioritizes the latest project state across participants",
    messages: [
      {
        from: "partner@example.com",
        day: 1,
        text: "The deployment is blocked by a failed compatibility check. We need engineering to rerun it.",
      },
      {
        from: "engineer@example.org",
        day: 2,
        text: "The compatibility check now passes. Rollout still needs the customer's maintenance window. The account owner must confirm that window before release.",
      },
      {
        from: "partner@example.com",
        day: 3,
        text: "For our review tomorrow, please decide whether to schedule the rollout this week or defer it. The customer's maintenance window is not confirmed yet.",
      },
    ],
    criterion:
      "Meeting priorities identify the rollout timing decision and the unconfirmed maintenance window, with the account owner responsible for confirmation. They treat the compatibility check as passed, not as a current blocker. Do not claim a release date or window has been agreed.",
  },
  {
    name: "does not invent priorities or identities from an empty history",
    messages: [],
    criterion:
      "The briefing does not invent projects, pending work, commitments, or an individual identity for the shared mailbox. Meeting priorities are empty. It may note that no prior context was retrieved, but must not assert this proves a first meeting.",
  },
  {
    name: "distinguishes a proposed action from an approved commitment",
    messages: [
      {
        from: "partner@example.com",
        day: 1,
        text: "We could offer the pilot to a second region, but please do not announce anything. We need the service owner's approval at the review first.",
      },
      {
        from: "owner@example.org",
        day: 3,
        text: "Capacity remains uncertain. At the review we should decide whether to commission a capacity study before expanding. No expansion has been approved.",
      },
    ],
    criterion:
      "The briefing prepares the user to discuss capacity and whether to commission a study. Expansion remains a proposal requiring approval; no launch, announcement, approval, or study is described as already committed or completed.",
  },
];

describe.runIf(shouldRunEvalTests())("meeting briefing", () => {
  describeEvalMatrix("meeting preparation", (model, emailAccount) => {
    for (const scenario of scenarios) {
      test(scenario.name, async () => {
        const result = await aiGenerateMeetingBriefing({
          emailAccount,
          logger,
          briefingData: {
            event: {
              id: "review",
              title: "Project review",
              startTime: new Date("2026-02-04T14:00:00Z"),
              endTime: new Date("2026-02-04T15:00:00Z"),
              attendees: [{ email: "partner@example.com" }],
            },
            externalGuests: [
              { email: "partner@example.com", name: "Partner team mailbox" },
            ],
            internalTeamMembers: [],
            pastMeetings: [],
            emailThreads: scenario.messages.length
              ? [
                  {
                    id: "project-thread",
                    messages: scenario.messages.map((message, index) => ({
                      ...getMockMessage({
                        id: `message-${index}`,
                        from: message.from,
                        subject: "Project review",
                        textPlain: message.text,
                        textHtml: "",
                      }),
                      internalDate: String(Date.UTC(2026, 1, message.day, 12)),
                    })),
                  },
                ]
              : [],
          },
        });
        const judgment = await judgeBinary({
          input: JSON.stringify({
            meeting: "Project review",
            guests: [
              { email: "partner@example.com", name: "Partner team mailbox" },
            ],
            messages: scenario.messages,
          }),
          output: JSON.stringify(result),
          criterion: { name: scenario.name, description: scenario.criterion },
        });
        reporter.record({
          testName: scenario.name,
          model: model.label,
          pass: judgment.pass,
          actual: JSON.stringify(result),
          criteria: [judgment],
        });
        expect(result.guests).toHaveLength(1);
        expect(judgment.pass, judgment.reasoning).toBe(true);
      }, 120_000);
    }
  });
  afterAll(() => reporter.printReport());
});
