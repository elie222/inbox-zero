import { afterEach, describe, expect, test, vi } from "vitest";
import { aiCollectReplyContext } from "@/utils/ai/reply/reply-context-collector";
import type { EmailForLLM, ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailAccount } from "@/__tests__/helpers";

// Run with: pnpm test-ai reply-context-collector

vi.mock("server-only", () => ({}));

const isAiTest = process.env.RUN_AI_TESTS === "true";
const TEST_TIMEOUT = 60_000;

describe.runIf(isAiTest)("aiCollectReplyContext", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  test(
    "collects historical context and returns relevant emails",
    async () => {
      const emailAccount = getEmailAccount({ email: "support@company.com" });
      const currentThread: EmailForLLM[] = [
        {
          id: "msg-1",
          from: "alicesmith@gmail.com",
          to: emailAccount.email,
          subject: "Refund policy clarification",
          content:
            "Hey, I'd like to order an arm chair. How do refunds work? Alice",
          date: new Date(),
        },
      ];

      // Enrich historical dataset with more examples that a search query could return
      const historicalMessages = [
        // Completed thread: refund question -> our reply
        getParsedMessage({
          id: "p1c",
          subject: "Where is my refund?",
          snippet: "I returned my order last week. When will I see the refund?",
          from: "customer1@example.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "p1r",
          subject: "Re: Where is my refund?",
          snippet:
            "Refunds post within 3-5 business days after the return is processed.",
          from: emailAccount.email,
          to: "customer1@example.com",
        }),
        // Completed thread: invoice request -> our reply
        getParsedMessage({
          id: "p2c",
          subject: "Invoice request for March",
          snippet: "Could you resend the March invoice?",
          from: "customer2@example.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "p2r",
          subject: "Re: Invoice request for March",
          snippet:
            "Attached is your March invoice. Let me know if you need more.",
          from: emailAccount.email,
          to: "customer2@example.com",
        }),
      ];

      // Spy on the search queries being issued by the agent
      const observedQueries: string[] = [];
      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: historicalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Basic: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["3-5 business days", "march invoice"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for a realistic support scenario (refund + invoice)",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-support-1",
          from: "customer.alpha@example.com",
          to: emailAccount.email,
          subject: "Refund still missing for order #12345",
          date: new Date(),
          content:
            "Hi team, I requested a refund for order #12345 two weeks ago but haven't seen it on my card. Can you confirm the status? The item was returned last Monday.",
        },
      ];

      const observedQueries: string[] = [];
      const historicalMessages = getSupportHistoricalMessages(
        emailAccount.email,
      );

      // Inline provider stub to capture search queries
      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: historicalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["invoice", "5-10 business days", "3-5 days"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for technical support scenario (bug reports)",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-tech-1",
          from: "developer@techcompany.com",
          to: emailAccount.email,
          subject: "API throwing 500 errors since yesterday",
          date: new Date(),
          content:
            "We're getting intermittent 500 errors from the /api/v2/users endpoint. Started around 3pm PST yesterday. Error message: 'Database connection timeout'. Our request IDs: req_abc123, req_def456. This is affecting our production environment.",
        },
      ];

      const observedQueries: string[] = [];
      // Completed technical threads for learning how we replied before
      const technicalHistoricalMessages = [
        getParsedMessage({
          id: "tech-c1",
          subject: "API throwing 500 errors since yesterday",
          snippet:
            "We're seeing intermittent 500s on /api/v2/users since yesterday.",
          from: "developer@techcompany.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "tech-r1",
          subject: "Re: API throwing 500 errors since yesterday",
          snippet:
            "We found a database connection pool issue and deployed a fix; errors have stopped.",
          from: emailAccount.email,
          to: "developer@techcompany.com",
        }),
        getParsedMessage({
          id: "tech-c2",
          subject: "Webhook failing with 404",
          snippet: "Our webhook endpoint is returning 404 on delivery.",
          from: "ops@partner.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "tech-r2",
          subject: "Re: Webhook failing with 404",
          snippet:
            "Please verify URL /webhooks/events; 404s were due to a typo.",
          from: emailAccount.email,
          to: "ops@partner.com",
        }),
      ];

      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: technicalHistoricalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Technical support: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["connection pool", "webhook"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for escalated customer with multiple issues",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-escalation-1",
          from: "angry.customer@example.com",
          to: emailAccount.email,
          subject: "UNACCEPTABLE SERVICE - Multiple issues!!!",
          date: new Date(),
          content:
            "This is the THIRD TIME I'm writing about this! My subscription was charged twice last month ($99 each), I still haven't received my premium features, AND your support team hasn't responded to my last 2 emails! Order #78901. I've been a customer for 5 years and this is how you treat me? I want a full refund and compensation for this terrible experience!",
        },
      ];

      const observedQueries: string[] = [];
      const escalationHistoricalMessages = [
        getParsedMessage({
          id: "esc-c1",
          subject: "Duplicate charges and missing features",
          snippet: "I was charged twice and premium features aren't active.",
          from: "frustrated@customer.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "esc-r1",
          subject: "Re: Duplicate charges and missing features",
          snippet:
            "Refunded duplicate charges and activated premium; added 2 months credit.",
          from: emailAccount.email,
          to: "frustrated@customer.com",
        }),
      ];

      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: escalationHistoricalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Escalation: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["duplicate charges", "activated premium"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for billing and subscription management",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-billing-1",
          from: "finance@company.com",
          to: emailAccount.email,
          subject: "Upgrading to Enterprise plan - questions",
          date: new Date(),
          content:
            "Hi, we're interested in upgrading from Pro to Enterprise. Can you provide: 1) Volume discounts for 200+ seats? 2) Annual payment options? 3) Data migration assistance? 4) Custom contract terms? We're currently paying $2,400/month on Pro plan.",
        },
      ];

      const observedQueries: string[] = [];
      const billingHistoricalMessages = [
        getParsedMessage({
          id: "bill-c1",
          subject: "Enterprise pricing questions",
          snippet: "Do you offer volume discounts and annual billing?",
          from: "procurement@largecorp.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "bill-r1",
          subject: "Re: Enterprise pricing questions",
          snippet:
            "Yes: 20% at 200+ seats, 30% at 500+; annual billing has 20% discount.",
          from: emailAccount.email,
          to: "procurement@largecorp.com",
        }),
      ];

      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: billingHistoricalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Billing: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = [
        "annual billing",
        "200+ seats",
        "volume discount",
      ];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for shipping and order tracking",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-shipping-1",
          from: "worried.buyer@example.com",
          to: emailAccount.email,
          subject: "Order #54321 - Still not delivered after 2 weeks",
          date: new Date(),
          content:
            "I ordered a laptop (Order #54321) two weeks ago with express shipping. The tracking number (1Z999AA1234567890) shows it's been stuck at the distribution center for 5 days. This was supposed to be a birthday gift! Can you help expedite this or send a replacement?",
        },
      ];

      const observedQueries: string[] = [];
      const shippingHistoricalMessages = [
        getParsedMessage({
          id: "ship-c1",
          subject: "Order #88888 - delayed shipment",
          snippet: "Tracking shows stuck at hub for 4 days.",
          from: "impatient@buyer.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "ship-r1",
          subject: "Re: Order #88888 - delayed shipment",
          snippet:
            "Contacted carrier and arranged expedited shipping; new ETA tomorrow 10:30 AM.",
          from: emailAccount.email,
          to: "impatient@buyer.com",
        }),
      ];

      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: shippingHistoricalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Shipping: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["expedited shipping"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for product inquiries and recommendations",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-product-1",
          from: "researcher@university.edu",
          to: emailAccount.email,
          subject: "Questions about Pro Analytics features",
          date: new Date(),
          content:
            "Hello, I'm evaluating analytics platforms for our research team. Specifically: 1) Does Pro Analytics support R integration? 2) Can it handle datasets over 1TB? 3) Is there academic pricing? 4) Can multiple users collaborate on the same dataset simultaneously? We're comparing your solution with Tableau and PowerBI.",
        },
      ];

      const observedQueries: string[] = [];
      const productHistoricalMessages = [
        getParsedMessage({
          id: "prod-c1",
          subject: "Pro Analytics - feature questions",
          snippet: "Does Pro support R and large datasets?",
          from: "datascientist@research.edu",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "prod-r1",
          subject: "Re: Pro Analytics - feature questions",
          snippet:
            "Yes, native R integration; handles 1TB+ datasets with proper indexing.",
          from: emailAccount.email,
          to: "datascientist@research.edu",
        }),
      ];

      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: productHistoricalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Product inquiry: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["r integration", "1tb", "terabyte"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "collects context for account access and security issues",
    async () => {
      const emailAccount = getEmailAccount();

      // Current thread is unanswered: incoming customer email only
      const currentThread = [
        {
          id: "msg-security-1",
          from: "locked.out@business.com",
          to: emailAccount.email,
          subject: "URGENT: Cannot access account - important deadline",
          date: new Date(),
          content:
            "I've been locked out of my account (username: john.doe@business.com) after too many login attempts. I have a critical presentation in 2 hours and all my files are in the account! I tried password reset but I'm not receiving the emails. This is extremely urgent - can you help me regain access immediately?",
        },
      ];

      const observedQueries: string[] = [];
      const securityHistoricalMessages = [
        getParsedMessage({
          id: "sec-c1",
          subject: "Locked out of account - urgent",
          snippet: "Too many login attempts, can't receive reset email.",
          from: "locked@user.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "sec-r1",
          subject: "Re: Locked out of account - urgent",
          snippet:
            "Temporarily disabled 2FA and sent a temporary password via SMS.",
          from: emailAccount.email,
          to: "locked@user.com",
        }),
      ];

      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: securityHistoricalMessages };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `Security: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result).not.toBeNull();
      expect(Array.isArray(result?.relevantEmails)).toBe(true);
      expect(result?.relevantEmails.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      const expectedPhrases = ["2fa", "temporary password"];
      const containsExpected = expectedPhrases.some((p) =>
        outputText.includes(p.toLowerCase()),
      );
      expect(containsExpected).toBe(true);

      console.log("result", result);
    },
    TEST_TIMEOUT,
  );

  test(
    "handles no relevant history by not fabricating irrelevant details",
    async () => {
      const emailAccount = getEmailAccount();
      // Unanswered incoming thread on a niche topic with likely no prior history
      const currentThread: EmailForLLM[] = [
        {
          id: "msg-niche-1",
          from: "rare.user@example.com",
          to: emailAccount.email,
          subject: "Obscure feature X interop with legacy Y",
          date: new Date(),
          content:
            "Does your system support feature X interoperating with legacy Y from 1998?",
        },
      ];

      // Historical messages that are unrelated (to test that the agent doesn't force-fit)
      const unrelatedHistory: ParsedMessage[] = [
        getParsedMessage({
          id: "u1",
          subject: "Weekly newsletter",
          snippet: "Here's our weekly newsletter.",
          from: emailAccount.email,
          to: "list@example.com",
        }),
        getParsedMessage({
          id: "u2",
          subject: "Team offsite schedule",
          snippet: "Agenda for next week.",
          from: emailAccount.email,
          to: "team@example.com",
        }),
      ];

      const observedQueries: string[] = [];
      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            observedQueries.push(options.query || "");
            return { messages: unrelatedHistory };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log(
        `No-history: LLM issued ${observedQueries.length} search call(s):`,
        observedQueries,
      );

      expect(result?.relevantEmails.length || 0).toBe(0);
    },
    TEST_TIMEOUT,
  );

  test(
    "uses simple subject line search first for better results",
    async () => {
      const emailAccount = getEmailAccount({ email: "support@company.com" });
      const currentThread: EmailForLLM[] = [
        {
          id: "msg-1",
          from: "customer@example.com",
          to: emailAccount.email,
          subject: "Failed payment",
          content:
            "Hey, I saw your payment failed. The payment link I sent is no longer valid. Can you help?",
          date: new Date(),
        },
      ];

      // Historical messages about failed payments
      const historicalMessages = [
        getParsedMessage({
          id: "h1",
          subject: "Failed payment",
          snippet: "Your payment was declined. Here's a new link...",
          from: emailAccount.email,
          to: "other@example.com",
        }),
        getParsedMessage({
          id: "h2",
          subject: "Re: Failed payment",
          snippet: "Thanks, the new payment link worked!",
          from: "other@example.com",
          to: emailAccount.email,
        }),
        getParsedMessage({
          id: "h3",
          subject: "Payment processing error",
          snippet: "We're having issues with payment processing...",
          from: emailAccount.email,
          to: "another@example.com",
        }),
      ];

      const observedQueries: string[] = [];
      const emailProvider = {
        name: "google",
        getMessagesWithPagination: vi
          .fn()
          .mockImplementation(async (options: { query?: string }) => {
            const query = options.query || "";
            observedQueries.push(query);

            // Simulate realistic search behavior - exact matches work better
            if (
              query === "Failed payment" ||
              query.includes("Failed payment")
            ) {
              return {
                messages: [historicalMessages[0], historicalMessages[1]],
              };
            } else if (query.includes("payment")) {
              return { messages: historicalMessages };
            }
            return { messages: [] };
          }),
      } as unknown as EmailProvider;

      const result = await aiCollectReplyContext({
        currentThread,
        emailAccount,
        emailProvider,
      });

      console.log("Subject line search queries:", observedQueries);

      // Verify it searched using the subject line first or early
      const usedSubjectLine = observedQueries.some(
        (q) => q === "Failed payment" || q.includes("Failed payment"),
      );
      expect(usedSubjectLine).toBe(true);

      // Verify it found relevant results
      expect(result).not.toBeNull();
      expect(result?.relevantEmails?.length).toBeGreaterThan(0);

      const outputText = relevantEmailsToLowerText(result);
      expect(outputText).toContain("payment");
    },
    TEST_TIMEOUT,
  );
});

function getParsedMessage(overrides: {
  id: string;
  subject: string;
  snippet: string;
  from: string;
  to: string;
}): ParsedMessage {
  const now = new Date().toISOString();
  return {
    id: overrides.id,
    threadId: `t-${overrides.id}`,
    snippet: overrides.snippet,
    textPlain: overrides.snippet,
    textHtml: undefined,
    subject: overrides.subject,
    date: now,
    historyId: "0",
    internalDate: now,
    headers: {
      from: overrides.from,
      to: overrides.to,
      subject: overrides.subject,
      date: now,
    },
    labelIds: [],
    inline: [],
  };
}

// intentionally left without a generic mock provider; tests inline-stub the provider to also capture search queries

function getSupportHistoricalMessages(ownerEmail: string): ParsedMessage[] {
  const base = new Date().toISOString();
  return [
    getParsedMessage({
      id: "h1",
      subject: "Refund policy overview",
      snippet:
        "Refunds are processed within 5-10 business days after the return is received.",
      from: ownerEmail,
      to: "customer.beta@example.com",
    }),
    getParsedMessage({
      id: "h2",
      subject: "Return received — refund initiated",
      snippet:
        "We have initiated your refund. You should see it within 5-10 business days.",
      from: ownerEmail,
      to: "customer.gamma@example.com",
    }),
    getParsedMessage({
      id: "h3",
      subject: "Invoice request for March",
      snippet:
        "Attached is your March invoice. Let us know if you need anything else.",
      from: ownerEmail,
      to: "customer.delta@example.com",
    }),
    getParsedMessage({
      id: "h4",
      subject: "Where is my refund?",
      snippet:
        "Tracking shows the return arrived yesterday; refunds usually post within 3-5 days.",
      from: ownerEmail,
      to: "customer.epsilon@example.com",
    }),
    getParsedMessage({
      id: "h5",
      subject: "Return window and eligibility",
      snippet:
        "Items returned within 30 days are eligible for a full refund once inspected.",
      from: ownerEmail,
      to: "customer.zeta@example.com",
    }),
    getParsedMessage({
      id: "h6",
      subject: "Invoice correction",
      snippet:
        "We corrected the billing address and reissued the invoice. Apologies for the confusion.",
      from: ownerEmail,
      to: "customer.theta@example.com",
    }),
    getParsedMessage({
      id: "h7",
      subject: "Refund timeline clarification",
      snippet:
        "Card issuers can take up to 10 business days to display the refund after we process it.",
      from: ownerEmail,
      to: "customer.iota@example.com",
    }),
    getParsedMessage({
      id: "h8",
      subject: "Invoice re-send confirmation",
      snippet: "Resent the invoice to your accounting team as requested.",
      from: ownerEmail,
      to: "customer.kappa@example.com",
    }),
  ].map((m) => ({ ...m, internalDate: base, date: base }));
}

function relevantEmailsToLowerText(
  result: { relevantEmails?: string[] } | null,
): string {
  return (result?.relevantEmails || []).join(" \n\n").toLowerCase();
}
