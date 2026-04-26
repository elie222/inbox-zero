import { describe, test, expect, vi, afterAll } from "vitest";
import { SystemType } from "@/generated/prisma/enums";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { CONVERSATION_TRACKING_INSTRUCTIONS } from "@/utils/ai/choose-rule/run-rules";
import { getRuleConfig } from "@/utils/rule/consts";
import { getEmail, getRule } from "@/__tests__/helpers";
import { createScopedLogger } from "@/utils/logger";

// pnpm test-ai eval/choose-rule
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/choose-rule

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;
const logger = createScopedLogger("eval-choose-rule");

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

  // --- Reported problematic system emails ---
  {
    email: getEmail({
      from: "security@identitycloud.example",
      subject: "New sign-in to your admin account",
      content:
        "We detected a new sign-in to your admin account from Chrome on macOS at 09:41 UTC. If this was you, no action is needed. If this was not you, reset your password and review recent activity immediately.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "status@videoplatform.example",
      subject: "Incident update: Meeting creation delays",
      content:
        "We are investigating elevated errors affecting meeting creation in the EU region. Current impact: some users may experience delays when scheduling or starting meetings. We will provide another update in 30 minutes.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "alerts@backupservice.example",
      subject: "Backup failed for 3 devices",
      content:
        "Your scheduled backup completed with errors. Three devices were not fully backed up because cloud storage could not be reached. Open the dashboard to review affected devices and retry the job.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "no-reply@accounts.google.com",
      subject: "Security alert",
      content:
        "A new sign-in to your account was detected from Chrome on macOS. If this was you, no action is needed. If this was not you, review your security settings immediately.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "updates@saas-notify.example",
      subject: "Account status update",
      listUnsubscribe:
        "<https://saas-notify.example/unsubscribe?id=account-updates>",
      content:
        "Your account status changed after a recent billing check. No reply is required. Review the update in your dashboard and contact support from the app if you need help.",
    }),
    expectedRule: "Notification",
  },
  {
    email: getEmail({
      from: "receipts@rides.example",
      subject: "Your trip receipt for Tuesday evening",
      content:
        "Thanks for riding with Rides. Trip total: $28.44. Paid with Visa ending in 4242. Pickup: Rothschild Blvd. Dropoff: Ben Yehuda St. Download invoice or report a problem in the app.",
    }),
    expectedRule: "Receipt",
  },
  {
    email: getEmail({
      from: "licenses@devtools.example",
      subject: "Your license keys are ready",
      content:
        "Your annual Pro license purchase has been processed successfully. Seats: 5. Order total: $1,200. Download your invoice and manage license assignments from the admin portal.",
    }),
    expectedRule: "Receipt",
  },

  // --- Marketing disguised as personal outreach ---
  // These have List-Unsubscribe headers and personal tone, designed to test
  // whether the AI correctly identifies them as marketing despite the friendly language.
  {
    email: getEmail({
      from: "Lisa from MindfulPath <lisa@product.mindfulpath.com>",
      subject: "Earn a $30 gift card by sharing your thoughts",
      listUnsubscribe:
        "<https://product.mindfulpath.com/unsubscribe?id=abc123>",
      content: `Hey there,

I'm Lisa, the Research Lead here at MindfulPath. I'm reaching out on behalf of our User Experience team that designs and improves our wellness app.

We're so happy to have you as a member and would love to hear your thoughts about your experience so far. Your perspective as an active user is incredibly valuable to us, and we really want to make sure we're building features that matter to people like you.

Our sessions are quick — no more than 20 minutes over video call — and as a thank you, we'll send you a $30 gift card. The chat will be with a member of our product team. As a growing company, hearing directly from our community is the best way for us to make sure we're heading in the right direction.

We really hope you'll join us for a quick conversation. You can pick a time that works for you using the link below.

Thank you so much!
Lisa & the MindfulPath Team

Facebook Instagram TikTok
Questions? Contact Us
Privacy Policy | Terms of use | FAQ
You're receiving this email because you joined MindfulPath. To stop receiving these emails, unsubscribe here.
©2026 MindfulPath Inc. All rights reserved`,
    }),
    expectedRule: "Marketing",
  },
  {
    email: getEmail({
      from: "Maya from ToolStack <maya@research.example>",
      subject: "Your feedback + a $25 gift card",
      listUnsubscribe: "<https://research.example/unsubscribe?id=xyz789>",
      content: `Hi there,

I'm Maya from the ToolStack research team. We're reaching out to a small, hand-picked group of power users to learn about their experience with our platform. You were selected because you've been one of our most engaged users over the past quarter, and your insights would be particularly meaningful to our team.

The session is a casual 15-minute video call where we'll walk through your typical workflow and discuss any pain points or feature requests you might have. Our product designers will be listening in so they can directly hear your perspective and incorporate it into our next development cycle.

As a thank you for your time, every participant receives a $25 gift card — no strings attached.

If you're interested, just grab a time on my calendar that works for you: https://cal.example/maya/user-interview

I really hope we get to chat!

Best,
Maya
Product Research Lead, ToolStack

Unsubscribe from research invitations
ToolStack Inc. | 100 Innovation Blvd, Seattle, WA 98101`,
    }),
    expectedRule: ["Marketing", "Notification", "Conversations"],
  },
  {
    email: getEmail({
      from: "Jordan at GreenLeaf <jordan@hello.greenleafgoods.com>",
      subject: "Tell us what you think — get $10 off your next order",
      listUnsubscribe:
        "<https://hello.greenleafgoods.com/unsubscribe?id=def456>",
      content: `Hey there,

Thanks so much for being a GreenLeaf customer! I'm Jordan from our Customer Experience team, and I wanted to personally reach out to see how you've been enjoying our products.

We've been working hard on some new formulations and packaging improvements, and honest feedback from customers like you is what drives those decisions. It would mean a lot to us if you could take a couple of minutes to share your thoughts.

The survey is just 5 quick questions about your experience — what you love, what could be better, and any products you'd like to see from us in the future. As a small thank you, everyone who completes it gets a $10 discount code for their next order.

Start the survey here: https://greenleaf.typeform.com/survey

Thanks again for being part of the GreenLeaf community!

Warm regards,
Jordan
Customer Experience Team, GreenLeaf

You're receiving this because you purchased from GreenLeaf. Manage preferences or unsubscribe.
GreenLeaf Goods LLC | 200 Elm Street, Portland, OR 97201`,
    }),
    expectedRule: "Marketing",
  },
];

describe.runIf(shouldRunEval)("Eval: Choose Rule", () => {
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
            logger,
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
