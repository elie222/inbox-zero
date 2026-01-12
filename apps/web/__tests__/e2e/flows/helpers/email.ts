/**
 * Email sending and assertion helpers for E2E flow tests
 */

import type { EmailProvider } from "@/utils/email/types";
import type { TestAccount } from "./accounts";
import { getTestSubjectPrefix, getNextMessageSequence } from "../config";
import { logStep, logAssertion } from "./logging";

interface SendTestEmailOptions {
  from: TestAccount;
  to: TestAccount;
  subject: string;
  body: string;
  /** Whether to include E2E run ID prefix in subject */
  includePrefix?: boolean;
}

interface SendTestEmailResult {
  messageId: string;
  threadId: string;
  fullSubject: string;
}

/**
 * Send a test email from one account to another
 */
export async function sendTestEmail(
  options: SendTestEmailOptions,
): Promise<SendTestEmailResult> {
  const { from, to, subject, body, includePrefix = true } = options;

  const seq = getNextMessageSequence();
  const fullSubject = includePrefix
    ? `${getTestSubjectPrefix()}-${seq} ${subject}`
    : subject;

  logStep("Sending test email", {
    from: from.email,
    to: to.email,
    subject: fullSubject,
  });

  const result = await from.emailProvider.sendEmailWithHtml({
    to: to.email,
    subject: fullSubject,
    messageHtml: `<p>${body}</p>`,
  });

  logStep("Email sent", {
    messageId: result.messageId,
    threadId: result.threadId,
  });

  return {
    messageId: result.messageId,
    threadId: result.threadId,
    fullSubject,
  };
}

/**
 * Send a reply to an existing thread
 */
export async function sendTestReply(options: {
  from: TestAccount;
  to: TestAccount;
  threadId: string;
  originalMessageId: string;
  body: string;
}): Promise<SendTestEmailResult> {
  const { from, to, threadId, originalMessageId, body } = options;

  logStep("Sending test reply", {
    from: from.email,
    to: to.email,
    threadId,
  });

  // Get original message for reply headers
  const originalMessage =
    await from.emailProvider.getMessage(originalMessageId);

  const result = await from.emailProvider.sendEmailWithHtml({
    to: to.email,
    subject: originalMessage.subject?.startsWith("Re:")
      ? originalMessage.subject
      : `Re: ${originalMessage.subject}`,
    messageHtml: `<p>${body}</p>`,
    replyToEmail: {
      threadId,
      headerMessageId: originalMessage.headers["message-id"] || "",
      references: originalMessage.headers.references,
      messageId: originalMessageId, // Needed for Outlook's createReply API
    },
  });

  logStep("Reply sent", {
    messageId: result.messageId,
    threadId: result.threadId,
  });

  return {
    messageId: result.messageId,
    threadId: result.threadId,
    fullSubject: originalMessage.subject || "",
  };
}

/**
 * Assert that a message has specific labels/categories
 */
export async function assertEmailLabeled(options: {
  provider: EmailProvider;
  messageId: string;
  expectedLabels: string[];
}): Promise<void> {
  const { provider, messageId, expectedLabels } = options;

  logStep("Checking email labels", { messageId, expectedLabels });

  const message = await provider.getMessage(messageId);
  const actualLabels = message.labelIds || [];

  for (const expectedLabel of expectedLabels) {
    const hasLabel = actualLabels.some(
      (label) => label.toLowerCase() === expectedLabel.toLowerCase(),
    );

    logAssertion(
      `Label "${expectedLabel}" present`,
      hasLabel,
      `Found: ${actualLabels.join(", ")}`,
    );

    if (!hasLabel) {
      throw new Error(
        `Expected message ${messageId} to have label "${expectedLabel}", ` +
          `but found: [${actualLabels.join(", ")}]`,
      );
    }
  }
}

/**
 * Assert that a draft exists for a thread
 */
export async function assertDraftExists(options: {
  provider: EmailProvider;
  threadId: string;
}): Promise<{ draftId: string; content: string | undefined }> {
  const { provider, threadId } = options;

  logStep("Checking draft exists", { threadId });

  const drafts = await provider.getDrafts({ maxResults: 50 });
  const threadDraft = drafts.find((d) => d.threadId === threadId);

  if (!threadDraft?.id) {
    throw new Error(`Expected draft for thread ${threadId}, but none found`);
  }

  const draft = await provider.getDraft(threadDraft.id);

  logAssertion("Draft exists", true, `Draft ID: ${threadDraft.id}`);

  return {
    draftId: threadDraft.id,
    content: draft?.textPlain,
  };
}

/**
 * Assert that a draft does not exist (was deleted)
 */
export async function assertDraftDeleted(options: {
  provider: EmailProvider;
  draftId: string;
}): Promise<void> {
  const { provider, draftId } = options;

  logStep("Checking draft deleted", { draftId });

  try {
    const draft = await provider.getDraft(draftId);
    if (draft) {
      throw new Error(`Expected draft ${draftId} to be deleted, but it exists`);
    }
  } catch (error) {
    // Draft not found is expected
    if (error instanceof Error && !error.message.includes("to be deleted")) {
      // API error means draft doesn't exist - good
      logAssertion("Draft deleted", true);
      return;
    }
    throw error;
  }

  logAssertion("Draft deleted", true);
}

/**
 * Assert message is in a specific thread
 */
export async function assertMessageInThread(options: {
  provider: EmailProvider;
  messageId: string;
  expectedThreadId: string;
}): Promise<void> {
  const { provider, messageId, expectedThreadId } = options;

  logStep("Checking message thread", { messageId, expectedThreadId });

  const message = await provider.getMessage(messageId);

  const inThread = message.threadId === expectedThreadId;
  logAssertion(
    "Message in correct thread",
    inThread,
    `Expected: ${expectedThreadId}, Got: ${message.threadId}`,
  );

  if (!inThread) {
    throw new Error(
      `Expected message ${messageId} to be in thread ${expectedThreadId}, ` +
        `but it's in thread ${message.threadId}`,
    );
  }
}

/**
 * Get test email scenarios for predictable AI classification
 */
export const TEST_EMAIL_SCENARIOS = {
  /** Email that clearly needs a reply */
  NEEDS_REPLY: {
    subject: "Please send me the Q4 sales report ASAP",
    body:
      "Hi, I need the Q4 sales report for the board meeting tomorrow. " +
      "Can you please send it to me as soon as possible? Thanks!",
    expectedLabels: ["Needs Reply", "To Reply", "Action Required"],
  },

  /** Email that is informational only */
  FYI_ONLY: {
    subject: "FYI: Q4 report is attached",
    body:
      "Here's the report you requested. No action needed on your end. " +
      "Just keeping you in the loop.",
    expectedLabels: ["FYI", "Informational", "No Reply Needed"],
  },

  /** Email that is a thank you / acknowledgment */
  THANK_YOU: {
    subject: "Thanks for the update!",
    body: "Thank you for sending the report. I really appreciate it!",
    expectedLabels: ["FYI", "Informational", "No Reply Needed"],
  },

  /** Email that is a question needing response */
  QUESTION: {
    subject: "Quick question about the project",
    body:
      "Hey, do you know when the next team meeting is scheduled? " +
      "I want to make sure I have the materials ready.",
    expectedLabels: ["Needs Reply", "To Reply", "Question"],
  },
} as const;

/**
 * Clean up test emails from inbox
 */
export async function cleanupTestEmails(options: {
  provider: EmailProvider;
  subjectPrefix: string;
  markAsRead?: boolean;
}): Promise<number> {
  const { provider, subjectPrefix, markAsRead = true } = options;

  logStep("Cleaning up test emails", { subjectPrefix });

  const messages = await provider.getInboxMessages(50);
  const testMessages = messages.filter((msg) =>
    msg.subject?.includes(subjectPrefix),
  );

  let cleaned = 0;
  for (const msg of testMessages) {
    if (markAsRead && msg.id) {
      try {
        await provider.markRead(msg.threadId);
        cleaned++;
      } catch {
        // Ignore errors during cleanup
      }
    }
  }

  logStep("Cleanup complete", { messagesProcessed: cleaned });
  return cleaned;
}
