import { describe, test, expect, afterAll } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { aiCategorizeSender } from "@/utils/ai/categorize-sender/ai-categorize-single-sender";
import { defaultCategory } from "@/utils/categories";

// pnpm test-ai eval/categorize-senders
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/categorize-senders

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 60_000;

// Enabled categories: Newsletter, Marketing, Receipt, Notification, Other
//
// Each test case represents a SENDER being categorized based on previous emails.
// Multi-email cases test pattern recognition; single-email cases test whether
// models can categorize with minimal context or safely abstain when signal is missing.
// Senders use generic addresses to force classification based on content.
const testCases = [
  // --- Newsletter senders ---
  {
    sender: "hello@morningbrew.com",
    emails: [
      {
        subject:
          "☕ Mar 10 — Markets rally on jobs data, OpenAI's new model, and more",
        snippet:
          "Good morning. US markets closed higher Friday after the February jobs report showed 275K new positions. Meanwhile, OpenAI quietly released a new reasoning model that outperforms GPT-4 on math benchmarks. In other news, Starbucks is testing a smaller store format in three cities.",
      },
      {
        subject:
          "☕ Mar 7 — TikTok deal timeline, new inflation data, weekend reads",
        snippet:
          "Good morning. Congress set a new deadline for ByteDance to divest TikTok's US operations. The latest CPI print came in at 2.8%, slightly below expectations. Plus, we've got your weekend reading list curated by our editors.",
      },
      {
        subject:
          "☕ Mar 5 — Apple's foldable timeline, startup layoffs tracker",
        snippet:
          "Good morning. Apple suppliers are reportedly gearing up for a foldable iPhone in 2027. We also built an interactive tracker of tech layoffs in Q1 2026. Here's your daily briefing.",
      },
    ],
    expected: "Newsletter",
  },
  // Newsletter with a sponsor ad embedded — still a newsletter sender
  {
    sender: "team@dense-discovery.com",
    emails: [
      {
        subject: "Dense Discovery — Issue 284",
        snippet:
          "Welcome to this week's issue. I've been reflecting on how our relationship with technology is changing. Below you'll find links to thoughtful reads about design ethics, urban planning, and creative tools. This issue is brought to you by Notion — try their new AI features free for 30 days. Also featured: an interview with the designer behind the new Patagonia rebrand.",
      },
      {
        subject: "Dense Discovery — Issue 283",
        snippet:
          "Hello friends. This week's theme: the tension between productivity culture and genuine creativity. We look at new research from Stanford, plus our usual roundup of apps, articles, and portfolio pieces worth your time.",
      },
      {
        subject: "Dense Discovery — Issue 282",
        snippet:
          "This week I've been exploring the concept of digital minimalism and how it relates to our design choices. Links to essays on architecture, typography trends, and tools for indie makers.",
      },
    ],
    expected: "Newsletter",
  },

  // --- Marketing senders ---
  // SaaS product pushing upgrades and feature adoption
  {
    sender: "team@notion.so",
    emails: [
      {
        subject: "5 ways teams are using Notion AI to save 4 hours per week",
        snippet:
          "Hi there, we've been hearing amazing stories from teams who switched to Notion AI. Here are five real workflows that are saving teams hours every week — from automated meeting notes to AI-powered project briefs. Ready to try it? Start your free trial today and see the difference for yourself.",
      },
      {
        subject: "What's new in Notion — February 2026",
        snippet:
          "We shipped 12 new features this month including repeating database templates, a redesigned sidebar, and Notion AI improvements. Upgrade to Plus to unlock all features and get unlimited AI responses.",
      },
      {
        subject: "Your workspace is growing — time to level up?",
        snippet:
          "Your team added 8 new members this month. Teams your size get the most out of Notion with the Business plan — advanced permissions, SAML SSO, and bulk PDF export. Compare plans and upgrade today.",
      },
    ],
    expected: "Marketing",
  },
  // Win-back / re-engagement sender
  {
    sender: "noreply@figma.com",
    emails: [
      {
        subject: "We miss you — here's what you've been missing",
        snippet:
          "It's been a while since you last opened Figma. Since then, we've launched multi-edit, auto layout 5.0, and an entirely new Dev Mode. Your old projects are still here waiting for you. Come back and see what's new — plus, we're offering 20% off annual plans for returning users.",
      },
      {
        subject: "Figma's biggest launch ever — Config 2026 recap",
        snippet:
          "You missed Config this year, but here's the highlight reel: Figma Slides is now GA, we redesigned the canvas engine from scratch, and there's a new free tier for individual designers. Watch the keynote on demand.",
      },
    ],
    expected: "Marketing",
  },

  // --- Receipt senders ---
  // Subscription billing
  {
    sender: "noreply@vercel.com",
    emails: [
      {
        subject: "Your Vercel Pro subscription has been renewed",
        snippet:
          "Hi, this is a confirmation that your Vercel Pro plan (Team: acme-corp) has been renewed for the next billing period. Amount charged: $20.00 to Visa ending in 4242. Next billing date: April 10, 2026.",
      },
      {
        subject: "Invoice #INV-2026-0189 from Vercel",
        snippet:
          "Your invoice for February 2026 is available. Vercel Pro (Team) — $20.00. Bandwidth add-on (150GB) — $10.00. Total: $30.00. Paid via Visa ending in 4242. Download your invoice PDF from your billing dashboard.",
      },
    ],
    expected: "Receipt",
  },
  // Travel booking + payment confirmations
  {
    sender: "noreply@airbnb.com",
    emails: [
      {
        subject: "Your reservation is confirmed — Tokyo, Apr 15-22",
        snippet:
          "Great news! Your stay at Shibuya Modern Loft with Yuki is confirmed. Check-in Apr 15 at 3:00 PM, Check-out Apr 22 at 11:00 AM. Total cost: $892.47 (7 nights × $112.50 + $105.97 fees). Charged to Mastercard ending in 8891.",
      },
      {
        subject: "Receipt for your stay in Lisbon",
        snippet:
          "Thanks for staying with Ana in Alfama. Here's your final receipt: 5 nights × $85.00 = $425.00, cleaning fee $40.00, service fee $65.80. Total charged: $530.80 to Mastercard ending in 8891.",
      },
    ],
    expected: "Receipt",
  },
  // Refunds + purchases from same sender
  {
    sender: "noreply@apple.com",
    emails: [
      {
        subject: "Your refund has been processed",
        snippet:
          "We've processed a refund of $14.99 for your purchase of Procreate Pocket (App Store). The refund has been credited to your Apple ID balance and should appear within 5-10 business days.",
      },
      {
        subject: "Receipt from Apple",
        snippet:
          "Apple ID: elie@gmail.com. iCloud+ 200GB — $2.99/month. Billed Mar 1, 2026. Order ID: ML4928XTPZ. Payment: Visa ending in 4242.",
      },
      {
        subject: "Receipt from Apple",
        snippet:
          "Apple ID: elie@gmail.com. 1Password — Families — $6.99/month. Billed Feb 1, 2026. Order ID: MK7712RQVN. Payment: Visa ending in 4242.",
      },
    ],
    expected: "Receipt",
  },

  // --- Notification senders ---
  // Code review and CI notifications
  {
    sender: "noreply@github.com",
    emails: [
      {
        subject:
          "Re: [acme/backend] fix: resolve race condition in queue processor (#847)",
        snippet:
          "@jsmith requested changes on this pull request. 1) The mutex lock in processQueue() could deadlock if the worker crashes mid-execution. 2) The test coverage for the retry logic is incomplete.",
      },
      {
        subject: "[acme/backend] CI failed for branch fix/queue-processor",
        snippet:
          "2 checks failed: lint (node 20) — Process completed with exit code 1. test-integration — 3 failures in QueueProcessorTest.",
      },
      {
        subject:
          "[acme/api] New issue: Rate limiter not respecting per-org quotas (#903)",
        snippet:
          "Opened by @sarah-eng. When org-level rate limits are configured, the limiter still applies the global default. Steps to reproduce attached.",
      },
    ],
    expected: "Notification",
  },
  // Infrastructure / ops alerts
  {
    sender: "noreply@aws.amazon.com",
    emails: [
      {
        subject: "AWS Notification — Auto Scaling event in us-east-1",
        snippet:
          "An Auto Scaling event has occurred for group prod-api-asg in us-east-1. Launching 3 new EC2 instances due to CloudWatch alarm HighCPUUtilization (threshold: 80%, current: 94.2%). Current group size: 8 instances.",
      },
      {
        subject:
          "AWS Health Event — Operational issue with Amazon RDS in us-east-1",
        snippet:
          "We are investigating increased error rates for Amazon RDS in the US-EAST-1 Region. Affected resource: prod-db-primary (db.r6g.xlarge). We will provide an update within 30 minutes.",
      },
    ],
    expected: "Notification",
  },
  // Shopify store notifications — this sender sends order alerts, not receipts
  // (the merchant receives these, not the buyer)
  {
    sender: "noreply@shopify.com",
    emails: [
      {
        subject: "You have a new order! — Order #4821",
        snippet:
          "You received a new order from Sarah M. 2× Organic Cotton Tee (Navy, M) — $34.00 each, 1× Canvas Tote Bag — $22.00. Total: $103.67. Fulfill by Mar 14 to meet standard shipping SLA.",
      },
      {
        subject: "You have a new order! — Order #4819",
        snippet:
          "You received a new order from James R. 1× Linen Throw Pillow (Oat) — $45.00. Total: $50.99. This customer is a returning buyer (3rd order).",
      },
      {
        subject: "Inventory alert: 2 products running low",
        snippet:
          "Organic Cotton Tee (Navy, M) has 3 units remaining. Canvas Tote Bag has 5 units remaining. Reorder soon to avoid stockouts. View inventory in your Shopify admin.",
      },
    ],
    expected: "Notification",
  },

  // --- Hard boundary cases ---
  // Bank/financial sender — periodic statements are notifications, not receipts
  {
    sender: "noreply@chase.com",
    emails: [
      {
        subject: "Your February statement is ready",
        snippet:
          "Your Chase Sapphire Reserve statement for Feb 1-28, 2026 is now available. Statement balance: $3,247.82. Minimum payment: $35.00 due by March 25. You earned 4,892 Ultimate Rewards points this period.",
      },
      {
        subject: "Fraud alert: Unusual activity on your card",
        snippet:
          "We detected a transaction that doesn't match your usual spending pattern: $487.00 at ELECTRONICS STORE in Miami, FL on Mar 8 at 11:42 PM. If you made this purchase, no action needed. If not, call us immediately at 1-800-935-9935.",
      },
    ],
    expected: "Notification",
  },
  // A personal/business email with no category signals
  {
    sender: "mark@consultagency.co",
    emails: [
      {
        subject: "Following up",
        snippet:
          "Hi, I wanted to circle back on our conversation from last week. Let me know if you had a chance to think about it and whether it makes sense to schedule a call. Happy to work around your schedule.",
      },
      {
        subject: "Nice meeting you at the conference",
        snippet:
          "Great chatting yesterday. As promised, here's the deck I mentioned about our approach to developer relations. Would love to continue the conversation when you have time.",
      },
    ],
    expected: "Other",
  },
  // No prior email context should not force a category
  {
    sender: "unknown@example.com",
    emails: [],
    expected: null,
  },
  // SaaS that mixes marketing and notifications — but this sender's pattern is updates
  {
    sender: "hello@company.io",
    emails: [
      {
        subject: "Quick update",
        snippet:
          "Hey, just wanted to let you know that we've made some changes to our API rate limits. Nothing you need to do right now — existing integrations are unaffected. See the changelog for details.",
      },
      {
        subject: "Scheduled maintenance — March 15",
        snippet:
          "We'll be performing scheduled maintenance on Saturday March 15 from 2:00-4:00 AM UTC. Expect brief downtime for the dashboard. API endpoints will not be affected.",
      },
    ],
    expected: "Notification",
  },
  // --- Single-email senders (less signal, model must decide with minimal context) ---
  // Clear receipt even with one email — payment details are unambiguous
  {
    sender: "noreply@gumroad.com",
    emails: [
      {
        subject: "You've purchased: Design System Checklist",
        snippet:
          "Thanks for your purchase! Design System Checklist by Sarah K. Amount: $24.00. Payment: Visa ending in 4242. Download your file here. If you have any issues, reply to this email.",
      },
    ],
    expected: "Receipt",
  },
  // Clear notification even with one email — automated system event
  {
    sender: "noreply@railway.app",
    emails: [
      {
        subject: "Deploy failed: acme-api (production)",
        snippet:
          "Deployment d3f8a2c failed for acme-api in production. Error: Build exited with code 1. Logs: npm ERR! Could not resolve dependency peer react@^18 required by react-dom@19.0.0. View full logs in your Railway dashboard.",
      },
    ],
    expected: "Notification",
  },
  // Single email from a SaaS — onboarding/welcome. Promotional intent despite helpful tone.
  {
    sender: "hello@resend.com",
    emails: [
      {
        subject: "Welcome to Resend — here's how to get started",
        snippet:
          "Thanks for signing up! Here's a quick guide: 1) Verify your domain in Settings. 2) Send your first email with our REST API or Node SDK. 3) Set up webhooks for delivery tracking. Need help? Reply to this email or check our docs. Pro tip: upgrade to the Pro plan for dedicated IPs and higher sending limits.",
      },
    ],
    expected: "Marketing",
  },
  // Single email that's clearly a newsletter — first issue received
  {
    sender: "hello@tldr.tech",
    emails: [
      {
        subject:
          "TLDR 2026-03-10 — Google's new chip, open source LLM beats GPT-4, Stripe acquires Lemon Squeezy",
        snippet:
          "Here's your daily byte-sized summary of the most interesting stories in tech. Google unveiled its Willow chip delivering 3x the performance per watt. Meta released Llama 4 Scout, an open source model. Stripe confirmed the Lemon Squeezy acquisition for $100M. Sponsor: Try Cloudflare Workers AI — now with built-in vector search.",
      },
    ],
    expected: "Newsletter",
  },
  // Vague teaser email — still marketing despite minimal content
  {
    sender: "info@newstartup.io",
    emails: [
      {
        subject: "Thanks for your interest",
        snippet:
          "Hi there, thanks for stopping by. We're building something we think you'll love. Stay tuned for updates — we'll be in touch soon with more details.",
      },
    ],
    expected: "Marketing",
  },
];

describe.runIf(shouldRunEval)("Eval: Categorize Senders", () => {
  const evalReporter = createEvalReporter();

  describeEvalMatrix("categorize", (model, emailAccount) => {
    for (const tc of testCases) {
      const expectedLabel = tc.expected ?? "none";
      test(
        `${tc.sender} → ${expectedLabel}`,
        async () => {
          const result = await aiCategorizeSender({
            emailAccount,
            sender: tc.sender,
            previousEmails: tc.emails,
            categories: getCategories(),
          });

          const actual = result?.category ?? "none";
          const expected = tc.expected ?? "none";
          const pass = actual === expected;
          evalReporter.record({
            testName: `${tc.sender} → ${expectedLabel}`,
            model: model.label,
            pass,
            expected: expectedLabel,
            actual,
          });

          expect(actual).toBe(expected);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});

function getCategories() {
  return Object.values(defaultCategory)
    .filter((c) => c.enabled)
    .map((c) => ({ name: c.name, description: c.description }));
}
