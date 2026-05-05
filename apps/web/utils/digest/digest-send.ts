import type { DigestSend } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

export async function digestAlreadySentToday(
  emailAccountId: string,
  todayET: Date,
): Promise<DigestSend | null> {
  return prisma.digestSend.findUnique({
    where: { emailAccountId_date: { emailAccountId, date: todayET } },
  });
}

export type RecordDigestSendInput = {
  emailAccountId: string;
  date: Date;
  sentAt: Date;
  resendMessageId: string | null;
  itemCount: number;
  inputTokens?: number;
  outputTokens?: number;
  modelUsed?: string;
  narrativeSnapshot?: string;
  digestIds: string[];
};

/**
 * Build the Prisma create-args object for DigestSend. Caller composes this into a
 * `prisma.$transaction` so the SENT-commit + DigestSend row + DigestItem redact happen
 * atomically.
 */
export function buildDigestSendCreate(input: RecordDigestSendInput) {
  return {
    data: {
      emailAccountId: input.emailAccountId,
      date: input.date,
      sentAt: input.sentAt,
      resendMessageId: input.resendMessageId,
      itemCount: input.itemCount,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      modelUsed: input.modelUsed ?? null,
      narrativeSnapshot: input.narrativeSnapshot?.slice(0, 4000) ?? null,
      digestIds: input.digestIds,
    },
  };
}
