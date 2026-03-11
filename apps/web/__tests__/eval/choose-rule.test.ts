import { describe, test, expect, vi, afterAll } from "vitest";
import { describeEvalMatrix } from "@/__tests__/eval/models";
import { evalReporter } from "@/__tests__/eval/reporter";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { getEmail, getRule } from "@/__tests__/helpers";

// pnpm test-ai eval/choose-rule
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/choose-rule

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TIMEOUT = 60_000;

// A realistic set of rules a founder/CEO might configure
const autoArchiveNewsletter = getRule(
  "Archive newsletters and marketing emails. Do NOT match if the email asks me a direct question or needs a reply.",
  [],
  "Auto-archive newsletters",
);
const labelReceipts = getRule(
  "Label receipts, invoices, and payment confirmations. Only match if there's an actual transaction amount or invoice number.",
  [],
  "Label receipts",
);
const requiresReply = getRule(
  "Match emails where someone is directly asking me a question or requesting something from me. The email should need a personal response, not just an FYI.",
  [],
  "Needs reply",
);
const forwardToAssistant = getRule(
  "Forward scheduling and meeting requests to my assistant. Match emails asking to book a call, schedule a meeting, or find a time.",
  [],
  "Forward to assistant",
);
const labelGithub = getRule(
  "Label GitHub notifications. Match CI failures, PR reviews, issue updates, and deployment notifications from GitHub.",
  [],
  "Label GitHub",
);
const coldEmail = getRule(
  "Archive unsolicited cold outreach and sales pitches from people I don't know. Do NOT match if it's from a known contact or about an existing project.",
  [],
  "Archive cold emails",
);

const rules = [
  autoArchiveNewsletter,
  labelReceipts,
  requiresReply,
  forwardToAssistant,
  labelGithub,
  coldEmail,
];

const testCases = [
  // --- Clear matches ---
  {
    email: getEmail({
      from: "noreply@stripe.com",
      subject: "Invoice #2026-0312 for Acme Corp",
      content:
        "Your invoice for March 2026 is ready. Stripe Billing — Acme Corp. Growth plan: $79.00/mo. Additional API calls (12,400): $24.80. Tax: $8.30. Total: $112.10. Paid via Visa ending in 4242. View invoice: https://dashboard.stripe.com/invoices/inv_1234",
    }),
    expectedRule: "Label receipts",
  },
  {
    email: getEmail({
      from: "notifications@github.com",
      subject: "[acme/api] fix: handle null pointer in auth middleware (#1247)",
      content:
        "@sarah-eng approved this pull request.\n\nLooks good! Just one nit: the error message on line 42 could be more descriptive. Otherwise LGTM.\n\n---\n\nView it on GitHub: https://github.com/acme/api/pull/1247#pullrequestreview-2839",
    }),
    expectedRule: "Label GitHub",
  },

  // --- Boundary: newsletter vs requires reply ---
  // Newsletter with "hit reply" CTA. The auto-archive rule says "Do NOT match if
  // the email asks me a direct question." Models correctly follow the exclusion and
  // match "Needs reply" instead. Only the strongest model ignores the engagement bait.
  {
    email: getEmail({
      from: "hello@lenny.com",
      subject: "How top PMs prioritize their roadmap | Lenny's Newsletter #214",
      content:
        "Hey friends, this week I interviewed three VPs of Product at late-stage startups about how they decide what to build next. The common thread? They all use a variation of the RICE framework, but with one twist. What's your approach to prioritization? Hit reply and let me know — I might feature your response in next week's issue. Read the full post: https://lenny.substack.com/p/214",
    }),
    expectedRule: "Needs reply",
  },
  // Clear newsletter with no question — should be archived
  {
    email: getEmail({
      from: "hello@lenny.com",
      subject:
        "The ultimate guide to product metrics | Lenny's Newsletter #215",
      content:
        "Hey friends, this week's post is a deep dive into the metrics that actually matter at each stage of your company. I break down what to track at pre-PMF, post-PMF, and at scale, with real examples from Figma, Notion, and Linear. Read the full post: https://lenny.substack.com/p/215\n\nThis week's sponsors: Amplitude — the leading product analytics platform. Try free at amplitude.com.",
    }),
    expectedRule: "Auto-archive newsletters",
  },
  // An actual question from a real person — not a newsletter
  {
    email: getEmail({
      from: "jason@sequoiacap.com",
      subject: "Quick question about your Series A metrics",
      content:
        "Hi Elie,\n\nI was reviewing the deck you sent over and had a question about your retention numbers. The 85% monthly retention you mentioned — is that for all cohorts or just the most recent one? Also, do you have the data broken out by plan tier?\n\nWould be helpful before our partner meeting on Thursday.\n\nBest,\nJason",
    }),
    expectedRule: "Needs reply",
  },

  // --- Boundary: cold email vs requires reply ---
  // Cold outreach disguised as a warm intro
  {
    email: getEmail({
      from: "david.martinez@growthagency.io",
      subject: "Loved your recent tweet about email productivity",
      content:
        "Hey Elie,\n\nSaw your tweet about hitting 100K users — congrats! I run a growth agency that specializes in developer tools and we've helped companies like LinearB and Raycast scale from 100K to 1M users.\n\nWould love to hop on a quick 15-min call to share some ideas specific to Inbox Zero. I've put together a short analysis of your current acquisition channels. Free this week?\n\nCheers,\nDavid Martinez\nFounder, GrowthAgency.io",
    }),
    expectedRule: "Archive cold emails",
  },
  // Warm outreach requesting a call — the scheduling intent triggers forward-to-assistant
  {
    email: getEmail({
      from: "tom@vercel.com",
      subject: "Re: Inbox Zero integration with v0",
      content:
        "Hey Elie,\n\nFollowing up on our chat at the Next.js Conf afterparty. I talked to the v0 team and they're interested in exploring an integration where v0 could generate email templates that work with your API.\n\nWould you be open to a call next week to scope it out? I can loop in their PM.\n\nBest,\nTom",
    }),
    expectedRule: "Forward to assistant",
  },
  // Warm outreach that needs a reply but does NOT ask to schedule
  {
    email: getEmail({
      from: "guillermo@vercel.com",
      subject: "Re: Next.js Conf speaker slot",
      content:
        "Hey Elie,\n\nWe'd love to have you speak at Next.js Conf this October. We're thinking a 20-min talk on how you built the AI email assistant — the architecture decisions, what worked, what didn't.\n\nWould you be interested? We can cover travel and hotel.\n\nBest,\nGuillermo",
    }),
    expectedRule: "Needs reply",
  },

  // --- Boundary: scheduling request vs general reply ---
  {
    email: getEmail({
      from: "lisa@techcrunch.com",
      subject: "Interview request — Inbox Zero feature for TechCrunch",
      content:
        "Hi Elie,\n\nI'm writing a piece about the new wave of AI email tools for TechCrunch and would love to include Inbox Zero. Could we schedule a 20-minute call this week or early next week? I'm flexible on timing.\n\nAlternatively, I can send over questions via email if that's easier.\n\nThanks,\nLisa Chen\nSenior Reporter, TechCrunch",
    }),
    expectedRule: "Forward to assistant",
  },

  // --- Boundary: receipt vs notification ---
  // Subscription charge notification — has an amount, so it's a receipt
  {
    email: getEmail({
      from: "noreply@vercel.com",
      subject: "Payment successful — Vercel Pro",
      content:
        "Your payment for Vercel Pro has been processed.\n\nTeam: inbox-zero\nPlan: Pro\nAmount: $20.00\nCard: Visa ending in 4242\nBilling period: Mar 1 — Mar 31, 2026\n\nView invoice: https://vercel.com/billing",
    }),
    expectedRule: "Label receipts",
  },

  // --- Multi-signal emails ---
  // GitHub billing email has a transaction amount — models match receipts rule
  // because it says "match if there's an actual transaction amount"
  {
    email: getEmail({
      from: "noreply@github.com",
      subject: "[acme] Action required: Payment method needs updating",
      content:
        "We were unable to process payment for your GitHub Team plan. The charge of $4.00 per user (8 users = $32.00) to Visa ending in 4242 was declined.\n\nPlease update your payment method within 7 days to avoid service interruption.\n\nUpdate payment: https://github.com/organizations/acme/settings/billing",
    }),
    expectedRule: "Label receipts",
  },

  // Personal email that asks a question — matches "needs reply"
  {
    email: getEmail({
      from: "mom@gmail.com",
      subject: "Dinner Sunday?",
      content:
        "Hi sweetie, are you free for dinner this Sunday? Dad wants to try that new Italian place on Main Street. Let us know! Love, Mom",
    }),
    expectedRule: "Needs reply",
  },
  // Recurring informational email — matches the newsletter/archive rule
  {
    email: getEmail({
      from: "noreply@weather.com",
      subject: "Your weekly weather summary",
      content:
        "Here's your weather summary for San Francisco, CA this week. Monday: 65°F, partly cloudy. Tuesday: 62°F, morning fog. Wednesday: 68°F, sunny. Thursday: 64°F, overcast. Friday: 70°F, clear skies. Have a great week!",
    }),
    expectedRule: "Auto-archive newsletters",
  },

  // --- Newsletter with strong promotional content ---
  // Marketing language but from a newsletter sender
  {
    email: getEmail({
      from: "team@producthunt.com",
      subject: "Top 5 products this week + exclusive launch offer",
      content:
        "This week on Product Hunt:\n\n1. ArcBrowser 2.0 — The browser that thinks for you (4,200 upvotes)\n2. Notion Calendar — Finally, a calendar that connects to your docs\n3. Cursor Pro — AI-powered IDE goes enterprise\n4. Inbox Zero — AI email management hits 100K users 🎉\n5. Fig 2.0 — Terminal autocomplete gets smarter\n\n🔥 Special offer: Get 50% off any Product of the Day this week with code PH50.\n\nHappy hunting,\nThe Product Hunt Team",
    }),
    expectedRule: "Auto-archive newsletters",
  },
];

describe.runIf(isAiTest)("Eval: Choose Rule", () => {
  evalReporter.reset();

  describeEvalMatrix("choose-rule", (model, emailAccount) => {
    for (const tc of testCases) {
      const label = tc.expectedRule ?? "no match";
      test(
        `${tc.email.from} → ${label}`,
        async () => {
          const result = await aiChooseRule({
            email: tc.email,
            rules,
            emailAccount,
          });

          const primaryRule = result.rules.find((r) => r.isPrimary);
          const actual =
            primaryRule?.rule.name ?? result.rules[0]?.rule.name ?? "no match";
          const expected = tc.expectedRule ?? "no match";
          const pass = actual === expected;

          evalReporter.record({
            testName: `${tc.email.from} → ${label}`,
            model: model.label,
            pass,
            expected,
            actual,
          });

          if (tc.expectedRule === null) {
            expect(result.rules).toEqual([]);
          } else {
            expect(actual).toBe(tc.expectedRule);
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
