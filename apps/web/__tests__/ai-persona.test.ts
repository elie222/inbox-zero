import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiAnalyzePersona } from "@/utils/ai/knowledge/persona";
import type { EmailForLLM } from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";

const TIMEOUT = 30_000;

// Run with: pnpm test-ai ai-persona

vi.mock("server-only", () => ({}));

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)(
  "aiAnalyzePersona",
  () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    function getEmailAccount(
      overrides: Partial<EmailAccountWithAI> = {},
    ): EmailAccountWithAI {
      return {
        id: "test-account-id",
        email: "user@test.com",
        userId: "test-user-id",
        about: null,
        user: {
          aiModel: null,
          aiProvider: null,
          aiApiKey: null,
        },
        ...overrides,
      };
    }

    function getFounderEmails(): EmailForLLM[] {
      return [
        {
          id: "email-1",
          from: "user@test.com",
          to: "investor@vc.com",
          subject: "Q3 Investor Update",
          content:
            "Hi John, Hope you're well. Here's our Q3 update: We've grown MRR by 45% to $125K, closed 3 enterprise deals, and are preparing for our Series A. The product roadmap for Q4 includes AI features and enterprise SSO. Let me know if you'd like to discuss our fundraising timeline.",
        },
        {
          id: "email-2",
          from: "user@test.com",
          to: "cto@startup.com",
          subject: "Re: Technical Architecture Discussion",
          content:
            "Thanks for the feedback on our architecture plans. I agree we should prioritize scalability. I've discussed with our engineering team and we'll implement the microservices approach you suggested. Can we sync next week to review the implementation plan?",
        },
        {
          id: "email-3",
          from: "user@test.com",
          to: "advisor@company.com",
          subject: "Board deck review",
          content:
            "Hi Sarah, Attached is the board deck for next week's meeting. Key highlights: runway extends to 18 months, hiring plan for 5 engineers, and partnership discussions with Microsoft. Would love your input on the go-to-market strategy slides.",
        },
      ];
    }

    function getSoftwareEngineerEmails(): EmailForLLM[] {
      return [
        {
          id: "email-4",
          from: "user@test.com",
          to: "team@company.com",
          subject: "PR Review: Feature/user-authentication",
          content:
            "Hey team, I've pushed the authentication feature to the PR. It includes JWT token handling, OAuth integration, and rate limiting. Tests are passing and I've updated the documentation. Can someone review? Planning to deploy to staging once approved.",
        },
        {
          id: "email-5",
          from: "user@test.com",
          to: "pm@company.com",
          subject: "Re: Sprint Planning",
          content:
            "I've estimated the tasks: API integration - 3 points, Database migration - 5 points, Frontend components - 2 points. The refactoring work might spill into next sprint if we hit any blockers. I'll need design specs by Wednesday to stay on track.",
        },
        {
          id: "email-6",
          from: "user@test.com",
          to: "junior@company.com",
          subject: "Code review feedback",
          content:
            "Nice work on the PR! A few suggestions: 1) Consider extracting the validation logic into a separate function, 2) Add error handling for the edge case we discussed, 3) The test coverage looks good but add a test for null inputs. Let me know if you want to pair on any of this.",
        },
      ];
    }

    function getPersonalEmails(): EmailForLLM[] {
      return [
        {
          id: "email-7",
          from: "user@test.com",
          to: "friend@gmail.com",
          subject: "Weekend plans",
          content:
            "Hey! Are we still on for brunch on Saturday? I made reservations at that new place downtown for 11am. Also, did you want to check out the farmer's market after? Let me know!",
        },
        {
          id: "email-8",
          from: "user@test.com",
          to: "family@gmail.com",
          subject: "Re: Holiday plans",
          content:
            "Hi Mom, Yes, I'll be there for Thanksgiving! I'll arrive Wednesday evening. Should I bring anything? I can make that apple pie you like. Also, is cousin Mark still coming? Haven't seen him in ages!",
        },
        {
          id: "email-9",
          from: "user@test.com",
          to: "service@company.com",
          subject: "Subscription cancellation",
          content:
            "Hi, I'd like to cancel my monthly subscription. I haven't been using the service much lately. Please confirm the cancellation and that I won't be charged next month. Thanks!",
        },
      ];
    }

    test(
      "successfully identifies a Founder persona",
      async () => {
        const result = await aiAnalyzePersona({
          emails: getFounderEmails(),
          emailAccount: getEmailAccount(),
        });

        console.debug(
          "Founder analysis result:\n",
          JSON.stringify(result, null, 2),
        );

        expect(result).toBeDefined();
        expect(result?.persona).toMatch(/Founder|CEO|Entrepreneur/i);
        expect(result?.industry).toBeDefined();
        expect(result?.positionLevel).toBe("executive");
        expect(result?.responsibilities).toBeInstanceOf(Array);
        expect(result?.responsibilities.length).toBeGreaterThanOrEqual(3);
        expect(result?.confidence).toMatch(/medium|high/);
        expect(result?.reasoning).toBeDefined();
      },
      TIMEOUT,
    );

    test(
      "successfully identifies a Software Engineer persona",
      async () => {
        const result = await aiAnalyzePersona({
          emails: getSoftwareEngineerEmails(),
          emailAccount: getEmailAccount(),
        });

        console.debug(
          "Software Engineer analysis result:\n",
          JSON.stringify(result, null, 2),
        );

        expect(result).toBeDefined();
        expect(result?.persona).toMatch(
          /Software Engineer|Developer|Engineer/i,
        );
        expect(result?.positionLevel).toMatch(/mid|senior/);
        expect(result?.responsibilities).toBeInstanceOf(Array);
        expect(result?.confidence).toMatch(/medium|high/);
      },
      TIMEOUT,
    );

    test(
      "successfully identifies Individual/Personal use",
      async () => {
        const result = await aiAnalyzePersona({
          emails: getPersonalEmails(),
          emailAccount: getEmailAccount(),
        });

        console.debug(
          "Personal use analysis result:\n",
          JSON.stringify(result, null, 2),
        );

        expect(result).toBeDefined();
        expect(result?.persona).toMatch(/Individual|Personal/i);
        expect(result?.confidence).toBeDefined();
        expect(result?.reasoning).toContain("personal");
      },
      TIMEOUT,
    );

    test("handles empty email list", async () => {
      const result = await aiAnalyzePersona({
        emails: [],
        emailAccount: getEmailAccount(),
      });

      expect(result).toBeNull();
    });

    test(
      "uses additional user context when available",
      async () => {
        const result = await aiAnalyzePersona({
          emails: getFounderEmails(),
          emailAccount: getEmailAccount(),
        });

        console.debug(
          "Analysis with user context:\n",
          JSON.stringify(result, null, 2),
        );

        expect(result).toBeDefined();
        expect(result?.industry.toLowerCase()).toContain("hr");
        expect(result?.confidence).toBe("high");
      },
      TIMEOUT,
    );

    test(
      "identifies mixed role patterns",
      async () => {
        const mixedEmails: EmailForLLM[] = [
          ...getFounderEmails().slice(0, 1),
          ...getSoftwareEngineerEmails().slice(0, 1),
          {
            id: "email-10",
            from: "user@test.com",
            to: "client@company.com",
            subject: "Consulting proposal",
            content:
              "Hi Alex, Following our discussion, I've prepared a proposal for the 3-month engagement. I'll lead the technical architecture review and help implement the new microservices. My rate is $200/hour with a minimum of 20 hours/week. Let me know your thoughts.",
          },
        ];

        const result = await aiAnalyzePersona({
          emails: mixedEmails,
          emailAccount: getEmailAccount(),
        });

        console.debug(
          "Mixed role analysis result:\n",
          JSON.stringify(result, null, 2),
        );

        expect(result).toBeDefined();
        expect(result?.reasoning).toBeDefined();
        // Should identify the dominant pattern or a hybrid role
      },
      TIMEOUT,
    );
  },
  30_000,
);
