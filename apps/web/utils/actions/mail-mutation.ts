"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  executeArchiveMutationBatchBody,
  executeMailMutationBody,
} from "./mail-mutation.validation";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { createEmailProvider } from "@/utils/email/provider";
import { classifyEmailAccountProviderIssue } from "@/utils/email/provider-health";
import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";
import { isGoogleProvider } from "@/utils/email/provider-types";
import {
  extractErrorInfo as extractGmailErrorInfo,
  isRetryableError as isGmailRetryableError,
} from "@/utils/gmail/retry";
import {
  extractErrorInfo as extractMicrosoftErrorInfo,
  isRetryableError as isMicrosoftRetryableError,
} from "@/utils/microsoft/retry";
import {
  activatePreparedSnoozedThread,
  cancelSnoozedThreadByClientMutationId,
  prepareSnoozedThread,
} from "@/utils/snooze/scheduler";

export const executeArchiveMutationBatchAction = actionClient
  .metadata({ name: "executeArchiveMutationBatch" })
  .inputSchema(executeArchiveMutationBatchBody)
  .action(async ({ ctx, parsedInput }) => {
    const { emailAccountId, logger, provider } = ctx;
    try {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
      await emailProvider.archiveMessages(
        parsedInput.mutations.flatMap((mutation) => mutation.messageIds),
      );
      return { status: "applied" as const };
    } catch (error) {
      return classifyFailure({ error, provider });
    }
  });

export const executeMailMutationAction = actionClient
  .metadata({ name: "executeMailMutation" })
  .inputSchema(executeMailMutationBody)
  .action(async ({ ctx, parsedInput }) => {
    const { emailAccountId, logger, provider } = ctx;

    if (parsedInput.kind === "reply") {
      return executeDurableEmailSend({
        emailAccountId,
        getEmailProvider: () =>
          createEmailProvider({ emailAccountId, provider, logger }),
        input: parsedInput,
        provider,
      });
    }

    let emailProvider: Awaited<ReturnType<typeof createEmailProvider>>;
    try {
      emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });
    } catch (error) {
      return classifyFailure({ error, provider });
    }

    try {
      switch (parsedInput.kind) {
        case "archive":
          await emailProvider.archiveMessages(
            parsedInput.messageIds,
            parsedInput.labelId,
          );
          break;
        case "unarchive":
          await emailProvider.unarchiveMessages(parsedInput.messageIds);
          break;
        case "trash":
          await emailProvider.trashMessages(parsedInput.messageIds);
          break;
        case "untrash":
          await emailProvider.untrashMessages(parsedInput.messageIds);
          break;
        case "spam":
          await emailProvider.markSpam(parsedInput.threadId);
          break;
        case "set_read_state":
          await emailProvider.markMessagesReadState(
            parsedInput.messageIds,
            parsedInput.read,
          );
          break;
        case "snooze": {
          const scheduledFor = new Date(parsedInput.scheduledFor);
          const prepared = await prepareSnoozedThread({
            clientMutationId: parsedInput.mutationId,
            emailAccountId,
            scheduledFor,
            threadId: parsedInput.threadId,
          });
          if (prepared.created && scheduledFor.getTime() <= Date.now()) {
            await cancelSnoozedThreadByClientMutationId({
              clientMutationId: parsedInput.mutationId,
              emailAccountId,
            });
            return {
              status: "rejected" as const,
              error: "Snooze time has passed",
            };
          }
          if (prepared.snoozedThread.status === "CANCELLED") {
            return {
              status: "rejected" as const,
              error: "Snooze was cancelled",
            };
          }
          if (prepared.snoozedThread.status !== "PREPARING") {
            return { status: "already_applied" as const };
          }
          if (scheduledFor.getTime() <= Date.now()) {
            await emailProvider.unarchiveMessages(parsedInput.messageIds);
            await cancelSnoozedThreadByClientMutationId({
              clientMutationId: parsedInput.mutationId,
              emailAccountId,
            });
            return {
              status: "applied" as const,
              result: { reconciled: "snooze_expired" as const },
            };
          }
          try {
            await emailProvider.archiveMessages(parsedInput.messageIds);
          } catch (error) {
            const failure = classifyFailure({ error, provider });
            if (failure.status === "rejected") {
              await cancelSnoozedThreadByClientMutationId({
                clientMutationId: parsedInput.mutationId,
                emailAccountId,
              });
            }
            return failure;
          }
          const activated = await activatePreparedSnoozedThread({
            clientMutationId: parsedInput.mutationId,
            emailAccountId,
            scheduledFor,
            threadId: parsedInput.threadId,
          });
          if (activated.status === "CANCELLED") {
            await emailProvider.unarchiveMessages(parsedInput.messageIds);
            return {
              status: "applied" as const,
              result: { reconciled: "snooze_cancelled" as const },
            };
          }
          break;
        }
        case "cancel_snooze":
          await cancelSnoozedThreadByClientMutationId({
            clientMutationId: parsedInput.snoozeMutationId,
            emailAccountId,
          });
          await emailProvider.unarchiveMessages(parsedInput.messageIds);
          break;
      }
      return { status: "applied" as const };
    } catch (error) {
      return classifyFailure({ error, provider });
    }
  });

function classifyFailure({
  error,
  provider,
}: {
  error: unknown;
  provider: string;
}) {
  if (
    classifyEmailAccountProviderIssue({
      error,
      provider: provider as "google" | "microsoft",
    })
  ) {
    return { status: "blocked_auth" as const };
  }
  if (isEmailProviderRateLimitError({ error, provider })) {
    return { status: "retry" as const };
  }
  if (isGoogleProvider(provider)) {
    const info = extractGmailErrorInfo(error);
    if (isGmailRetryableError(info).retryable)
      return { status: "retry" as const };
    if (info.status && info.status >= 400 && info.status < 500) {
      return {
        status: "rejected" as const,
        error: "Provider rejected the mutation",
      };
    }
  } else {
    const info = extractMicrosoftErrorInfo(error);
    if (isMicrosoftRetryableError(info).retryable) {
      return { status: "retry" as const };
    }
    if (info.status && info.status >= 400 && info.status < 500) {
      return {
        status: "rejected" as const,
        error: "Provider rejected the mutation",
      };
    }
  }
  return { status: "retry" as const };
}
