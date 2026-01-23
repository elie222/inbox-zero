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

  const sentBefore = new Date();

  const result = await from.emailProvider.sendEmailWithHtml({
    to: to.email,
    subject: fullSubject,
    messageHtml: `<p>${body}</p>`,
  });

  let { messageId, threadId } = result;

  // Outlook's Graph API doesn't return messageId for sent emails.
  // Query Sent Items to find and verify the actual sent message.
  if (!messageId && from.provider === "microsoft") {
    const sentMessage = await findVerifiedSentMessage({
      provider: from.emailProvider,
      threadId,
      expectedSubject: fullSubject,
      sentAfter: sentBefore,
    });
    messageId = sentMessage.id;
  }

  logStep("Email sent", {
    messageId,
    threadId,
  });

  return {
    messageId,
    threadId,
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

  // Log threading-critical values for debugging cross-provider threading issues
  // Note: Outlook may not populate references/in-reply-to, so use fallbacks for diagnostics
  logStep("sendTestReply - Threading headers", {
    originalMessageId,
    originalInternetMessageId: originalMessage.headers["message-id"],
    originalReferences:
      originalMessage.headers.references ??
      originalMessage.headers["in-reply-to"] ??
      originalMessage.headers["message-id"],
    outlookThreadId: threadId,
    subject: originalMessage.subject,
  });

  const replySubject = originalMessage.subject?.startsWith("Re:")
    ? originalMessage.subject
    : `Re: ${originalMessage.subject}`;

  const sentBefore = new Date();

  const result = await from.emailProvider.sendEmailWithHtml({
    to: to.email,
    subject: replySubject,
    messageHtml: `<p>${body}</p>`,
    replyToEmail: {
      threadId,
      headerMessageId: originalMessage.headers["message-id"] || "",
      references: originalMessage.headers.references,
      messageId: originalMessageId, // Needed for Outlook's createReply API
    },
  });

  let { messageId } = result;
  const { threadId: resultThreadId } = result;

  // Outlook's Graph API doesn't return messageId for sent emails.
  // Query Sent Items to find and verify the actual sent message.
  if (!messageId && from.provider === "microsoft") {
    const sentMessage = await findVerifiedSentMessage({
      provider: from.emailProvider,
      threadId: resultThreadId,
      expectedSubject: replySubject,
      sentAfter: sentBefore,
    });
    messageId = sentMessage.id;
  }

  logStep("Reply sent", {
    messageId,
    threadId: resultThreadId,
  });

  return {
    messageId,
    threadId: resultThreadId,
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

/**
 * Find and verify a sent message in Sent Items (Outlook workaround for E2E tests).
 * Outlook's Graph API doesn't return the sent message ID, so we query Sent Items
 * and verify the message matches our expectations.
 */
async function findVerifiedSentMessage(options: {
  provider: EmailProvider;
  threadId: string;
  expectedSubject: string;
  sentAfter: Date;
  maxAttempts?: number;
}): Promise<{ id: string }> {
  const {
    provider,
    threadId,
    expectedSubject,
    sentAfter,
    maxAttempts = 5,
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sentMessages = await provider.getSentMessages(20);

    const match = sentMessages.find((msg) => {
      if (msg.threadId !== threadId) return false;
      if (msg.subject !== expectedSubject) return false;

      const msgDate = new Date(msg.internalDate || msg.date);
      if (msgDate < sentAfter) return false;

      return true;
    });

    if (match) {
      logStep("Found verified sent message", {
        messageId: match.id,
        threadId: match.threadId,
        subject: match.subject,
        attempt: attempt + 1,
      });
      return { id: match.id };
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(
    `Failed to find sent message after ${maxAttempts} attempts. ` +
      `Expected threadId=${threadId}, subject="${expectedSubject}", sentAfter=${sentAfter.toISOString()}`,
  );
}
