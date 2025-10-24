import { describe, expect, test, vi, beforeEach } from "vitest";
import { aiDetermineThreadStatus } from "@/utils/ai/reply/determine-thread-status";
import {
  getEmailAccount,
  getEmail,
  generateSequentialDates,
} from "@/__tests__/helpers";
import { SystemType } from "@prisma/client";

// Run with: pnpm test-ai determine-thread-status

vi.mock("server-only", () => ({}));

const TIMEOUT = 15_000;

// Skip tests unless explicitly running AI tests
const isAiTest = process.env.RUN_AI_TESTS === "true";

describe.runIf(isAiTest)("aiDetermineThreadStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Helper for multi-person thread tests (chronological order with dates)
  const getProjectThread = () => {
    const emailData = [
      {
        from: "bob@company.com",
        to: "alice@company.com, carol@company.com",
        subject: "Re: Q4 Project Timeline",
        content: "Alice, can you send me the final design mockups by Friday?",
      },
      {
        from: "alice@company.com",
        to: "bob@company.com, carol@company.com",
        subject: "Re: Q4 Project Timeline",
        content: "I'm working on them. Should have v1 by Thursday.",
      },
      {
        from: "bob@company.com",
        to: "alice@company.com, carol@company.com",
        subject: "Re: Q4 Project Timeline",
        content: "Great! Carol, can you check the API endpoints?",
      },
      {
        from: "carol@company.com",
        to: "bob@company.com, alice@company.com",
        subject: "Re: Q4 Project Timeline",
        content: "Sure, I'll review them today and let you know.",
      },
      {
        from: "alice@company.com",
        to: "bob@company.com, carol@company.com",
        subject: "Re: Q4 Project Timeline",
        content:
          "Bob, quick question - do you need mobile mockups too or just desktop?",
      },
      {
        from: "bob@company.com",
        to: "alice@company.com, carol@company.com",
        subject: "Re: Q4 Project Timeline",
        content:
          "Yes please include mobile mockups. That would be really helpful.",
      },
    ];
    const dates = generateSequentialDates(emailData.length, 2); // 2 hours apart
    return emailData.map((email, index) =>
      getEmail({ ...email, date: dates[index] }),
    );
  };

  test(
    "identifies TO_REPLY when receiving a question",
    async () => {
      const emailAccount = getEmailAccount();
      const latestMessage = getEmail({
        from: "sender@example.com",
        to: emailAccount.email,
        subject: "Quick question",
        content: "Can you send me the Q3 report?",
      });

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: [latestMessage],
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.TO_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies FYI for informational emails",
    async () => {
      const emailAccount = getEmailAccount();
      const latestMessage = getEmail({
        from: "sender@example.com",
        to: emailAccount.email,
        subject: "Update",
        content: "FYI, the meeting time has changed to 3pm.",
      });

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: [latestMessage],
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.FYI);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies AWAITING_REPLY after sending a question",
    async () => {
      const emailAccount = getEmailAccount();
      const latestMessage = getEmail({
        from: emailAccount.email,
        to: "recipient@example.com",
        subject: "Report request",
        content: "Could you send me the Q3 report by Friday?",
      });

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: [latestMessage],
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.AWAITING_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies AWAITING_REPLY when someone says they'll get back to you",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = [
        getEmail({
          from: emailAccount.email,
          to: "recipient@example.com",
          subject: "Report request",
          content: "Could you send me the Q3 report?",
        }),
        getEmail({
          from: "recipient@example.com",
          to: emailAccount.email,
          subject: "Re: Report request",
          content: "I'll get this for you tomorrow.",
        }),
      ];

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: messages,
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.AWAITING_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies ACTIONED when conversation is complete",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = [
        getEmail({
          from: "recipient@example.com",
          to: emailAccount.email,
          subject: "Question",
          content: "Can you send me the report?",
        }),
        getEmail({
          from: emailAccount.email,
          to: "recipient@example.com",
          subject: "Re: Question",
          content: "Here it is, attached.",
        }),
        getEmail({
          from: "recipient@example.com",
          to: emailAccount.email,
          subject: "Re: Question",
          content: "Perfect, thanks!",
        }),
      ];

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: messages,
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.ACTIONED);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies TO_REPLY even when latest message is FYI but has unanswered question",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = [
        getEmail({
          from: "sender@example.com",
          to: emailAccount.email,
          subject: "Two things",
          content: "Can you send me the Q3 report?",
        }),
        getEmail({
          from: "sender@example.com",
          to: emailAccount.email,
          subject: "Re: Two things",
          content: "Also, FYI the meeting moved to 3pm.",
        }),
      ];

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: messages,
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.TO_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies ACTIONED when user sends final message",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = [
        getEmail({
          from: "recipient@example.com",
          to: emailAccount.email,
          subject: "Quick question",
          content: "Can you confirm the meeting time?",
        }),
        getEmail({
          from: emailAccount.email,
          to: "recipient@example.com",
          subject: "Re: Quick question",
          content: "Yes, 3pm works. See you then.",
        }),
      ];

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: messages,
      });

      console.debug("Result:", result);
      expect([SystemType.ACTIONED, SystemType.AWAITING_REPLY]).toContain(
        result.status,
      );
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "handles long thread context with multiple back-and-forth",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = [
        getEmail({
          from: "sender@example.com",
          to: emailAccount.email,
          subject: "Project discussion",
          content: "What do you think about the new design?",
        }),
        getEmail({
          from: emailAccount.email,
          to: "sender@example.com",
          subject: "Re: Project discussion",
          content:
            "I like it overall, but have concerns about the color scheme.",
        }),
        getEmail({
          from: "sender@example.com",
          to: emailAccount.email,
          subject: "Re: Project discussion",
          content: "Good point. What colors would you suggest?",
        }),
      ];

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: messages,
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.TO_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies FYI for automated notifications",
    async () => {
      const emailAccount = getEmailAccount();
      const latestMessage = getEmail({
        from: "notifications@github.com",
        to: emailAccount.email,
        subject: "[GitHub] Pull request merged",
        content: "Your pull request #123 has been merged into main.",
      });

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: [latestMessage],
      });

      console.debug("Result:", result);
      expect(result.status).toBe(SystemType.FYI);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "handles complex multi-person thread - Alice's perspective (TO_REPLY)",
    async () => {
      const alice = getEmailAccount({ email: "alice@company.com" });

      const result = await aiDetermineThreadStatus({
        emailAccount: alice,
        threadMessages: getProjectThread(),
      });

      console.debug("Alice's perspective:", result);
      // Alice asked about mobile mockups, Bob said "Yes please include" - Alice should acknowledge
      expect(result.status).toBe(SystemType.TO_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "handles complex multi-person thread - Bob's perspective (AWAITING_REPLY)",
    async () => {
      const bob = getEmailAccount({ email: "bob@company.com" });

      const result = await aiDetermineThreadStatus({
        emailAccount: bob,
        threadMessages: getProjectThread(),
      });

      console.debug("Bob's perspective:", result);
      // Bob is waiting for Alice to deliver mockups and Carol to report on API review
      expect(result.status).toBe(SystemType.AWAITING_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "handles complex multi-person thread - Carol's perspective (TO_REPLY)",
    async () => {
      const carol = getEmailAccount({ email: "carol@company.com" });

      const result = await aiDetermineThreadStatus({
        emailAccount: carol,
        threadMessages: getProjectThread(),
      });

      console.debug("Carol's perspective:", result);
      // Carol committed to reviewing API endpoints and reporting back - she needs to follow through
      expect(result.status).toBe(SystemType.TO_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  // Helper for lunch scheduling thread tests (chronological order with dates)
  const getLunchSchedulingThread = (
    person1Email: string,
    person2Email: string,
  ) => {
    const emailData = [
      {
        from: person1Email,
        to: person2Email,
        subject: "free for lunch tomorrow?",
        content: "Lmk if you're free",
      },
      {
        from: person2Email,
        to: person1Email,
        subject: "Re: free for lunch tomorrow?",
        content:
          "Yes, I'd love to. I'm free from 11 am to 1 pm tomorrow, would any time then work for you?",
      },
      {
        from: person1Email,
        to: person2Email,
        subject: "Re: free for lunch tomorrow?",
        content:
          "Great, does 12pm work for you? Let me know and I can book a table somewhere.",
      },
      {
        from: person2Email,
        to: person1Email,
        subject: "Re: free for lunch tomorrow?",
        content: "Let me get back to you about that soon!",
      },
      {
        from: person1Email,
        to: person2Email,
        subject: "Re: free for lunch tomorrow?",
        content: "Sounds good, let me know.",
      },
      {
        from: person2Email,
        to: person1Email,
        subject: "Re: free for lunch tomorrow?",
        content: "Ok. 5pm work tomorrow?",
      },
      {
        from: person1Email,
        to: person2Email,
        subject: "Re: free for lunch tomorrow?",
        content: "I'll get back to you soon!",
      },
    ];
    const dates = generateSequentialDates(emailData.length, 3); // 3 hours apart
    return emailData.map((email, index) =>
      getEmail({ ...email, date: dates[index] }),
    );
  };

  test(
    "identifies AWAITING_REPLY when other person says they'll get back to you (lunch scheduling)",
    async () => {
      const alice = getEmailAccount({ email: "alice@gmail.com" });

      const result = await aiDetermineThreadStatus({
        emailAccount: alice,
        threadMessages: getLunchSchedulingThread(
          "oliver@example.com",
          alice.email,
        ),
      });

      console.debug("Result:", result);
      // Oliver said "I'll get back to you soon!" so Alice should be awaiting his reply
      expect(result.status).toBe(SystemType.AWAITING_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies TO_REPLY when user says they'll get back to someone (lunch scheduling - Oliver's perspective)",
    async () => {
      const oliver = getEmailAccount({ email: "oliver@example.com" });

      const result = await aiDetermineThreadStatus({
        emailAccount: oliver,
        threadMessages: getLunchSchedulingThread(
          oliver.email,
          "alice@gmail.com",
        ),
      });

      console.debug("Result:", result);
      // Oliver committed to getting back to Alice about the 5pm time, so he needs to reply
      expect(result.status).toBe(SystemType.TO_REPLY);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );

  test(
    "identifies FYI when receiving instructions after offering help (not awaiting reply)",
    async () => {
      const emailAccount = getEmailAccount();
      const messages = [
        // Original message asking what platform can do
        getEmail({
          from: "team@platform.com",
          to: emailAccount.email,
          subject: "Platform Weekly Update",
          content: `We send these personalized updates to help our community grow. Let us know what else we can do to help you grow!

[... rest of newsletter content ...]`,
        }),
        // User offered to help platform users
        getEmail({
          from: emailAccount.email,
          to: "team@platform.com",
          subject: "Re: Platform Weekly Update",
          content: `Hey, I'd be happy to offer platform users a special discount if anyone is interested.
Let me know!`,
        }),
        // Latest message: Platform Support provides instructions
        getEmail({
          from: "support@platform.com",
          to: emailAccount.email,
          subject: "Re: Platform Weekly Update",
          content: `Hi, 

Here's how to get your product listed on our platform:

If your product is not listed yet:

1. Go to our registration page
2. Add your product name
3. Select your company
4. Choose relevant categories
5. Complete your product page with description, screenshots, and pricing

To get more visibility:

- Get at least 3 user reviews
- Complete your company profile fully
- Add detailed product information

Best regards,
Platform Support`,
        }),
      ];

      const result = await aiDetermineThreadStatus({
        emailAccount,
        threadMessages: messages,
      });

      console.debug("Result:", result);
      // ABC provided the help/instructions. User is not waiting for ABC to do something.
      // The ball is in the user's court to act on the information if they want to.
      // This should be FYI (informational) or TO_REPLY (if user wants to act), but NOT AWAITING_REPLY
      expect([SystemType.FYI, SystemType.TO_REPLY]).toContain(result.status);
      expect(result.rationale).toBeDefined();
    },
    TIMEOUT,
  );
});
