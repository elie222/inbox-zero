import { createHash } from "node:crypto";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { classifyEmailAccountProviderIssue } from "@/utils/email/provider-health";
import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";
import type { EmailProvider } from "@/utils/email/types";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email-cache/policy";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { DurableEmailSendBody } from "./durable-email-send.validation";

export const DURABLE_EMAIL_PROCESSING_LEASE_MS = 2 * 60 * 1000;

export class DurableEmailPreparationRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DurableEmailPreparationRejectedError";
  }
}

export async function executeDurableEmailSend({
  emailAccountId,
  getEmailProvider,
  input,
  payloadHashInput,
  prepareEmail,
  provider,
}: {
  emailAccountId: string;
  getEmailProvider: () => Promise<EmailProvider>;
  input: DurableEmailSendBody;
  payloadHashInput?: string;
  prepareEmail?: () => Promise<DurableEmailSendBody["email"]>;
  provider: string;
}) {
  const payloadHash = createHash("sha256")
    .update(
      payloadHashInput ??
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
    const staleBefore = new Date(
      Date.now() - DURABLE_EMAIL_PROCESSING_LEASE_MS,
    );
    if (existing.providerStartedAt === null) {
      await prisma.emailSendOperation.deleteMany({
        where: {
          id: existing.id,
          status: EmailSendOperationStatus.PROCESSING,
          processingStartedAt: { lte: staleBefore },
          providerStartedAt: null,
        },
      });
      return { status: "retry" as const };
    }
    const stale = await prisma.emailSendOperation.updateMany({
      where: {
        id: existing.id,
        status: EmailSendOperationStatus.PROCESSING,
        processingStartedAt: { lte: staleBefore },
        providerStartedAt: { not: null },
      },
      data: { status: EmailSendOperationStatus.UNCERTAIN },
    });
    return stale.count
      ? { status: "uncertain" as const }
      : { status: "retry" as const };
  }

  let email = input.email;
  try {
    if (prepareEmail) {
      email = await prepareEmail();
    }
    await prisma.emailSendOperation.update({
      where: { id: existing.id },
      data: { providerStartedAt: new Date() },
    });
  } catch (error) {
    await prisma.emailSendOperation.deleteMany({
      where: { id: existing.id },
    });
    return error instanceof DurableEmailPreparationRejectedError
      ? { status: "rejected" as const, error: error.message }
      : { status: "retry" as const };
  }

  try {
    const emailProvider = await getEmailProvider();
    const result = await emailProvider.sendEmailWithHtml(email);
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
    if (!isDuplicateError(error, ["emailAccountId", "clientMutationId"])) {
      throw error;
    }
    const operation = await findEmailSendOperation(emailAccountId, mutationId);
    if (!operation) throw error;
    return { ...operation, created: false };
  }
}
