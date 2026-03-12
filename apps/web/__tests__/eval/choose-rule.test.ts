import { describe, test, expect, vi, afterAll } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { CONVERSATION_TRACKING_INSTRUCTIONS } from "@/utils/ai/choose-rule/run-rules";
import { getRuleConfig } from "@/utils/rule/consts";
import { getEmail, getRule } from "@/__tests__/helpers";

// pnpm test-ai eval/choose-rule
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/choose-rule

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 60_000;

// Default system rules — mirrors what aiChooseRule actually receives in production.
// Cold email is handled in a prior step and conversation status (to_reply/fyi/etc)
// is resolved in a later step. Step 2 sees these rules + the collapsed "Conversations" meta-rule.
const systemRule = (type: SystemType) => {
  const config = getRuleConfig(type);
  return getRule(config.instructions, [], config.name);
};

const newsletter = systemRule(SystemType.NEWSLETTER);
const marketing = systemRule(SystemType.MARKETING);
const calendar = systemRule(SystemType.CALENDAR);
const receipt = systemRule(SystemType.RECEIPT);
const notification = systemRule(SystemType.NOTIFICATION);
const conversations = getRule(
  CONVERSATION_TRACKING_INSTRUCTIONS,
  [],
  "Conversations",
);

const rules = [
  newsletter,
  marketing,
  calendar,
  receipt,
  notification,
  conversations,
];

const testCases = [
  // --- Clear category matches ---
  {
    email: getEmail({
      from: "noreply@stripe.com",
      subject: "Invoice #2026-0312 for Acme Corp",
      content:
        "Your invoice for March 2026 is ready. Stripe Billing — Acme Corp. Growth plan: $79.00/mo. Additional API calls (12,400): $24.80. Tax: $8.30. Total: $112.10. Paid via Visa ending in 4242. View invoice: https://dashboard.stripe.com/invoices/inv_1234",
    }),
    expectedRule: "Receipt",
  },
  {
    email: getEmail({
      from: "noreply@vercel.com",
      subject: "Payment successful — Vercel Pro",
      content:
        "Your payment for Vercel Pro has been processed.\n\nTeam: inbox-zero\nPlan: Pro\nAmount: $20.00\nCard: Visa ending in 4242\nBilling period: Mar 1 — Mar 31, 2026\n\nView invoice: https://vercel.com/billing",
    }),
    expectedRule: "Receipt",
  },
  {
    email: getEmail({
      from: "hello@lenny.com",
      subject:
        "The ultimate guide to product metrics | Lenny's Newsletter #215",
      content:
        "Hey friends, this week's post is a deep dive into the metrics that actually matter at each stage of your company. I break down what to track at pre-PMF, post-PMF, and at scale, with real examples from Figma, Notion, and Linear. Read the full post: https://lenny.substack.com/p/215\n\nThis week's sponsors: Amplitude — the leading product analytics platform. Try free at amplitude.com.",
    }),
    expectedRule: "Newsletter",
  },
  {
    email: getEmail({
      from: "notifications@github.com",
      subject: "[acme/api] fix: handle null pointer in auth middleware (#1247)",
      content:
        "@sarah-eng approved this pull request.\n\nLooks good! Just one nit: the error message on line 42 could be more descriptive. Otherwise LGTM.\n\n---\n\nView it on GitHub: https://github.com/acme/api/pull/1247#pullrequestreview-2839",
    }),
    expectedRule: "Notification",
  },

  // --- Conversations: real people asking questions ---
  {
    email: getEmail({
      from: "jason@sequoiacap.com",
      subject: "Quick question about your Series A metrics",
      content:
        "Hi Elie,\n\nI was reviewing the deck you sent over and had a question about your retention numbers. The 85% monthly retention you mentioned — is that for all cohorts or just the most recent one? Also, do you have the data broken out by plan tier?\n\nWould be helpful before our partner meeting on Thursday.\n\nBest,\nJason",
    }),
    expectedRule: "Conversations",
  },
  {
    email: getEmail({
      from: "guillermo@vercel.com",
      subject: "Re: Next.js Conf speaker slot",
      content:
        "Hey Elie,\n\nWe'd love to have you speak at Next.js Conf this October. We're thinking a 20-min talk on how you built the AI email assistant — the architecture decisions, what worked, what didn't.\n\nWould you be interested? We can cover travel and hotel.\n\nBest,\nGuillermo",
    }),
    expectedRule: "Conversations",
  },
  {
    email: getEmail({
      from: "mom@gmail.com",
      subject: "Dinner Sunday?",
      content:
        "Hi sweetie, are you free for dinner this Sunday? Dad wants to try that new Italian place on Main Street. Let us know! Love, Mom",
    }),
    expectedRule: "Conversations",
  },

  // --- Calendar ---
  {
    email: getEmail({
      from: "calendar-notification@google.com",
      subject: "Reminder: Product sync @ Mon Mar 16, 2:00 PM",
      content:
        "This is a reminder for the following event.\n\nProduct sync\nMonday Mar 16, 2026 2:00 PM – 2:30 PM (PST)\nJoining info: meet.google.com/abc-defg-hij\nOrganizer: sarah@acme.com\n\nView event in Google Calendar",
    }),
    expectedRule: "Calendar",
  },
  {
    email: getEmail({
      from: "lisa@techcrunch.com",
      subject: "Interview request — Inbox Zero feature for TechCrunch",
      content:
        "Hi Elie,\n\nI'm writing a piece about the new wave of AI email tools for TechCrunch and would love to include Inbox Zero. Could we schedule a 20-minute call this week or early next week? I'm flexible on timing.\n\nAlternatively, I can send over questions via email if that's easier.\n\nThanks,\nLisa Chen\nSenior Reporter, TechCrunch",
    }),
    expectedRule: ["Calendar", "Conversations"],
  },

  // --- Boundary: newsletter with engagement CTA ---
  {
    email: getEmail({
      from: "hello@lenny.com",
      subject: "How top PMs prioritize their roadmap | Lenny's Newsletter #214",
      content:
        "Hey friends, this week I interviewed three VPs of Product at late-stage startups about how they decide what to build next. The common thread? They all use a variation of the RICE framework, but with one twist. What's your approach to prioritization? Hit reply and let me know — I might feature your response in next week's issue. Read the full post: https://lenny.substack.com/p/214",
    }),
    expectedRule: "Newsletter",
  },

  // --- Boundary: newsletter vs marketing ---
  {
    email: getEmail({
      from: "team@producthunt.com",
      subject: "Top 5 products this week + exclusive launch offer",
      content:
        "This week on Product Hunt:\n\n1. ArcBrowser 2.0 — The browser that thinks for you (4,200 upvotes)\n2. Notion Calendar — Finally, a calendar that connects to your docs\n3. Cursor Pro — AI-powered IDE goes enterprise\n4. Inbox Zero — AI email management hits 100K users 🎉\n5. Fig 2.0 — Terminal autocomplete gets smarter\n\n🔥 Special offer: Get 50% off any Product of the Day this week with code PH50.\n\nHappy hunting,\nThe Product Hunt Team",
    }),
    expectedRule: ["Newsletter", "Marketing"],
  },
  {
    email: getEmail({
      from: "no-reply@shopify.com",
      subject: "Grow your store — new marketing tools inside",
      content:
        "Introducing Shopify Audiences 2.0: reach high-intent buyers across Google, Meta, and TikTok with AI-powered ad targeting. Early merchants are seeing 2x ROAS improvements.\n\n🚀 Try it now — included free in your Shopify plan.\n\nShopify Marketing Team",
    }),
    expectedRule: "Marketing",
  },

  // --- Boundary: notification vs receipt ---
  // GitHub billing failure — has a dollar amount AND is a system notification
  {
    email: getEmail({
      from: "noreply@github.com",
      subject: "[acme] Action required: Payment method needs updating",
      content:
        "We were unable to process payment for your GitHub Team plan. The charge of $4.00 per user (8 users = $32.00) to Visa ending in 4242 was declined.\n\nPlease update your payment method within 7 days to avoid service interruption.\n\nUpdate payment: https://github.com/organizations/acme/settings/billing",
    }),
    expectedRule: ["Receipt", "Notification"],
  },

  // --- Boundary: automated notification that looks conversational ---
  // LinkedIn notification — should NOT match Conversations (it's automated)
  {
    email: getEmail({
      from: "notifications@linkedin.com",
      subject: "Sarah Chen commented on your post",
      content:
        'Sarah Chen commented on your post: "Great insights on AI email management! We\'ve been exploring similar approaches at our company. Would love to connect and share notes."\n\nView comment: https://linkedin.com/feed/update/12345',
    }),
    expectedRule: "Notification",
  },

  // --- Recurring informational email ---
  {
    email: getEmail({
      from: "noreply@weather.com",
      subject: "Your weekly weather summary",
      content:
        "Here's your weather summary for San Francisco, CA this week. Monday: 65°F, partly cloudy. Tuesday: 62°F, morning fog. Wednesday: 68°F, sunny. Thursday: 64°F, overcast. Friday: 70°F, clear skies. Have a great week!",
    }),
    expectedRule: ["Newsletter", "Notification"],
  },
];

describe.runIf(isAiTest)("Eval: Choose Rule", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("choose-rule", (model, emailAccount) => {
    for (const tc of testCases) {
      const expectedLabel = Array.isArray(tc.expectedRule)
        ? tc.expectedRule.join(" | ")
        : (tc.expectedRule ?? "no match");
      test(
        `${tc.email.from} → ${expectedLabel}`,
        async () => {
          const result = await aiChooseRule({
            email: tc.email,
            rules,
            emailAccount,
          });

          const primaryRule = result.rules.find((r) => r.isPrimary);
          const actual =
            primaryRule?.rule.name ?? result.rules[0]?.rule.name ?? "no match";
          const acceptable = Array.isArray(tc.expectedRule)
            ? tc.expectedRule
            : [tc.expectedRule ?? "no match"];
          const pass = acceptable.includes(actual);

          evalReporter.record({
            testName: `${tc.email.from} → ${expectedLabel}`,
            model: model.label,
            pass,
            expected: expectedLabel,
            actual,
          });

          if (tc.expectedRule === null) {
            expect(result.rules).toEqual([]);
          } else {
            expect(acceptable).toContain(actual);
          }
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
