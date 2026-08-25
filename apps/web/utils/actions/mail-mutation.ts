"use server";

import { createHash } from "node:crypto";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { actionClient } from "@/utils/actions/safe-action";
import {
  executeMailMutationBody,
  type ExecuteMailMutationBody,
} from "./mail-mutation.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { classifyEmailAccountProviderIssue } from "@/utils/email/provider-health";
import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email-cache/policy";
import {
  extractErrorInfo as extractGmailErrorInfo,
  isRetryableError as isGmailRetryableError,
} from "@/utils/gmail/retry";
import {
  extractErrorInfo as extractMicrosoftErrorInfo,
  isRetryableError as isMicrosoftRetryableError,
} from "@/utils/microsoft/retry";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  activatePreparedSnoozedThread,
  cancelSnoozedThreadByClientMutationId,
  prepareSnoozedThread,
} from "@/utils/snooze/scheduler";

const REPLY_PROCESSING_LEASE_MS = 2 * 60 * 1000;

export const executeMailMutationAction = actionClient
  .metadata({ name: "executeMailMutation" })
  .inputSchema(executeMailMutationBody)
  .action(async ({ ctx, parsedInput }) => {
    const { emailAccountId, logger, provider } = ctx;

    if (parsedInput.kind === "reply") {
      return executeReplyMutation({
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

async function executeReplyMutation({
  emailAccountId,
  getEmailProvider,
  input,
  provider,
}: {
  emailAccountId: string;
  getEmailProvider: () => ReturnType<typeof createEmailProvider>;
  input: Extract<ExecuteMailMutationBody, { kind: "reply" }>;
  provider: string;
}) {
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        threadId: input.threadId,
        messageIds: input.messageIds,
        email: input.email,
        queuedAt: input.queuedAt,
      }),
    )
    .digest("hex");
  const found = await findEmailSendOperation(emailAccountId, input.mutationId);
  if (!found && input.queuedAt < Date.now() - MAIL_MUTATION_RETRY_WINDOW_MS) {
    return {
      status: "rejected" as const,
      error: "Queued email is too old to send safely",
    };
  }
  const existing = found
    ? { ...found, created: false }
    : await createEmailSendOperation({
        emailAccountId,
        mutationId: input.mutationId,
        payloadHash,
      });
  if (existing.payloadHash !== payloadHash) {
    return { status: "rejected" as const, error: "Mutation ID was reused" };
  }
  if (existing.status === EmailSendOperationStatus.SENT) {
    return { status: "already_applied" as const, result: existing.result };
  }
  if (existing.status === EmailSendOperationStatus.UNCERTAIN) {
    return { status: "uncertain" as const };
  }
  if (!existing.created) {
    const staleBefore = new Date(Date.now() - REPLY_PROCESSING_LEASE_MS);
    const stale = await prisma.emailSendOperation.updateMany({
      where: {
        id: existing.id,
        status: EmailSendOperationStatus.PROCESSING,
        processingStartedAt: { lte: staleBefore },
      },
      data: { status: EmailSendOperationStatus.UNCERTAIN },
    });
    return stale.count
      ? { status: "uncertain" as const }
      : { status: "retry" as const };
  }

  try {
    const emailProvider = await getEmailProvider();
    const result = await emailProvider.sendEmailWithHtml(input.email);
    await prisma.emailSendOperation.update({
      where: { id: existing.id },
      data: { result, status: EmailSendOperationStatus.SENT },
    });
    return { status: "applied" as const, result };
  } catch (error) {
    if (isEmailProviderRateLimitError({ error, provider })) {
      await prisma.emailSendOperation.deleteMany({
        where: { id: existing.id },
      });
      return { status: "retry" as const };
    }
    if (
      classifyEmailAccountProviderIssue({
        error,
        provider: provider as "google" | "microsoft",
      })
    ) {
      await prisma.emailSendOperation.deleteMany({
        where: { id: existing.id },
      });
      return { status: "blocked_auth" as const };
    }
    await prisma.emailSendOperation.updateMany({
      where: { id: existing.id, status: EmailSendOperationStatus.PROCESSING },
      data: { status: EmailSendOperationStatus.UNCERTAIN },
    });
    return { status: "uncertain" as const };
  }
}

async function findEmailSendOperation(
  emailAccountId: string,
  mutationId: string,
) {
  return prisma.emailSendOperation.findUnique({
    where: {
      emailAccountId_clientMutationId: {
        emailAccountId,
        clientMutationId: mutationId,
      },
    },
  });
}

async function createEmailSendOperation({
  emailAccountId,
  mutationId,
  payloadHash,
}: {
  emailAccountId: string;
  mutationId: string;
  payloadHash: string;
}) {
  try {
    const operation = await prisma.emailSendOperation.create({
      data: {
        clientMutationId: mutationId,
        emailAccountId,
        payloadHash,
      },
    });
    return { ...operation, created: true };
  } catch (error) {
    if (!isDuplicateError(error, ["emailAccountId", "clientMutationId"]))
      throw error;
    const operation = await findEmailSendOperation(emailAccountId, mutationId);
    if (!operation) throw error;
    return { ...operation, created: false };
  }
}

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
