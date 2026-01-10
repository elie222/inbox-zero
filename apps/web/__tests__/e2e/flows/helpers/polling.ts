/**
 * Polling utilities for E2E flow tests
 *
 * These helpers poll database/API state until expected
 * conditions are met, with configurable timeouts.
 */

import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import { TIMEOUTS } from "../config";
import { logStep } from "./logging";
import { sleep } from "@/utils/sleep";

interface PollOptions {
  timeout?: number;
  interval?: number;
  description?: string;
}

/**
 * Generic polling function that waits for a condition to be true
 */
export async function pollUntil<T>(
  condition: () => Promise<T | null | undefined>,
  options: PollOptions = {},
): Promise<T> {
  const {
    timeout = TIMEOUTS.WEBHOOK_PROCESSING,
    interval = TIMEOUTS.POLL_INTERVAL,
    description = "condition",
  } = options;

  const startTime = Date.now();
  let lastError: Error | null = null;

  while (Date.now() - startTime < timeout) {
    try {
      const result = await condition();
      if (result) {
        logStep(`Condition met: ${description}`, {
          elapsed: Date.now() - startTime,
        });
        return result;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }

    await sleep(interval);
  }

  const elapsed = Date.now() - startTime;
  throw new Error(
    `Timeout waiting for ${description} after ${elapsed}ms` +
      (lastError ? `: ${lastError.message}` : ""),
  );
}

// Terminal statuses that indicate rule processing is complete
const TERMINAL_STATUSES = ["APPLIED", "SKIPPED", "ERROR"];

/**
 * Wait for an ExecutedRule to be created AND completed for a message
 *
 * Note: ExecutedRule starts in "APPLYING" status while actions are being executed.
 * This function waits until it reaches a terminal status (APPLIED, SKIPPED, or ERROR).
 *
 * Uses threadId for matching as it's more stable than messageId across webhook notifications.
 */
export async function waitForExecutedRule(options: {
  threadId: string;
  emailAccountId: string;
  timeout?: number;
}): Promise<{
  id: string;
  ruleId: string | null;
  status: string;
  messageId: string;
  actionItems: Array<{
    id: string;
    type: string;
    draftId: string | null;
    labelId: string | null;
  }>;
}> {
  const {
    threadId,
    emailAccountId,
    timeout = TIMEOUTS.WEBHOOK_PROCESSING,
  } = options;

  logStep("Waiting for ExecutedRule", { threadId, emailAccountId });

  return pollUntil(
    async () => {
      const executedRule = await prisma.executedRule.findFirst({
        where: {
          threadId,
          emailAccountId,
        },
        include: {
          actionItems: {
            select: {
              id: true,
              type: true,
              draftId: true,
              labelId: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!executedRule) {
        logStep("ExecutedRule not found yet", { threadId });
        return null;
      }

      // Wait for terminal status - rule processing must complete
      if (!TERMINAL_STATUSES.includes(executedRule.status)) {
        logStep("ExecutedRule still processing", {
          id: executedRule.id,
          status: executedRule.status,
        });
        return null;
      }

      return {
        id: executedRule.id,
        ruleId: executedRule.ruleId,
        status: executedRule.status,
        messageId: executedRule.messageId,
        actionItems: executedRule.actionItems.map((a) => ({
          id: a.id,
          type: a.type,
          draftId: a.draftId,
          labelId: a.labelId,
        })),
      };
    },
    {
      timeout,
      description: `ExecutedRule for thread ${threadId} to reach terminal status`,
    },
  );
}

/**
 * Wait for a draft to be created for a thread
 */
export async function waitForDraft(options: {
  threadId: string;
  emailAccountId: string;
  provider: EmailProvider;
  timeout?: number;
}): Promise<{ draftId: string; content: string | undefined }> {
  const {
    threadId,
    emailAccountId,
    provider,
    timeout = TIMEOUTS.WEBHOOK_PROCESSING,
  } = options;

  logStep("Waiting for draft", { threadId, emailAccountId });

  return pollUntil(
    async () => {
      // Check executedActions for draft
      const executedAction = await prisma.executedAction.findFirst({
        where: {
          executedRule: {
            emailAccountId,
            threadId,
          },
          type: "DRAFT_EMAIL",
          draftId: { not: null },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (executedAction?.draftId) {
        // Verify draft exists in provider
        const draft = await provider.getDraft(executedAction.draftId);
        if (draft) {
          return {
            draftId: executedAction.draftId,
            content: draft.textPlain,
          };
        }
      }

      return null;
    },
    {
      timeout,
      description: `Draft for thread ${threadId}`,
    },
  );
}

/**
 * Wait for a label to be applied to a message
 */
export async function waitForLabel(options: {
  messageId: string;
  labelName: string;
  provider: EmailProvider;
  timeout?: number;
}): Promise<void> {
  const {
    messageId,
    labelName,
    provider,
    timeout = TIMEOUTS.WEBHOOK_PROCESSING,
  } = options;

  logStep("Waiting for label", { messageId, labelName });

  await pollUntil(
    async () => {
      const message = await provider.getMessage(messageId);
      const hasLabel = message.labelIds?.some(
        (id) => id.toLowerCase() === labelName.toLowerCase(),
      );
      return hasLabel ? true : null;
    },
    {
      timeout,
      description: `Label "${labelName}" on message ${messageId}`,
    },
  );
}

/**
 * Wait for a message to appear in inbox (useful after sending)
 */
export async function waitForMessageInInbox(options: {
  provider: EmailProvider;
  subjectContains: string;
  timeout?: number;
}): Promise<{ messageId: string; threadId: string }> {
  const {
    provider,
    subjectContains,
    timeout = TIMEOUTS.EMAIL_DELIVERY,
  } = options;

  logStep("Waiting for message in inbox", { subjectContains });

  return pollUntil(
    async () => {
      const messages = await provider.getInboxMessages(20);
      const found = messages.find((msg) =>
        msg.subject?.includes(subjectContains),
      );

      if (found?.id && found?.threadId) {
        return {
          messageId: found.id,
          threadId: found.threadId,
        };
      }
      return null;
    },
    {
      timeout,
      description: `Message with subject containing "${subjectContains}"`,
    },
  );
}

/**
 * Wait for draft to be deleted (cleanup verification)
 */
export async function waitForDraftDeleted(options: {
  draftId: string;
  provider: EmailProvider;
  timeout?: number;
}): Promise<void> {
  const { draftId, provider, timeout = TIMEOUTS.WEBHOOK_PROCESSING } = options;

  logStep("Waiting for draft deletion", { draftId });

  await pollUntil(
    async () => {
      try {
        const draft = await provider.getDraft(draftId);
        // Draft still exists
        return draft === null ? true : null;
      } catch {
        // Draft not found = deleted
        return true;
      }
    },
    {
      timeout,
      description: `Draft ${draftId} to be deleted`,
    },
  );
}

/**
 * Wait for DraftSendLog to be recorded
 *
 * DraftSendLog is linked to ExecutedAction via executedActionId.
 * We find it by looking for logs related to actions on the given thread.
 */
export async function waitForDraftSendLog(options: {
  threadId: string;
  emailAccountId: string;
  timeout?: number;
}): Promise<{
  id: string;
  sentMessageId: string;
  similarityScore: number;
  draftId: string | null;
  wasSentFromDraft: boolean | null;
}> {
  const {
    threadId,
    emailAccountId,
    timeout = TIMEOUTS.WEBHOOK_PROCESSING,
  } = options;

  logStep("Waiting for DraftSendLog", { threadId, emailAccountId });

  return pollUntil(
    async () => {
      // Find DraftSendLog via the ExecutedAction -> ExecutedRule chain
      const log = await prisma.draftSendLog.findFirst({
        where: {
          executedAction: {
            executedRule: {
              threadId,
              emailAccountId,
            },
          },
        },
        include: {
          executedAction: {
            select: {
              draftId: true,
              wasDraftSent: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!log) return null;

      return {
        id: log.id,
        sentMessageId: log.sentMessageId,
        similarityScore: log.similarityScore,
        draftId: log.executedAction.draftId,
        wasSentFromDraft: log.executedAction.wasDraftSent,
      };
    },
    {
      timeout,
      description: `DraftSendLog for thread ${threadId}`,
    },
  );
}
