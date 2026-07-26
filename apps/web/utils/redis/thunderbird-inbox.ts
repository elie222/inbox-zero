import {
  thunderbirdActionSchema,
  type ThunderbirdBridgeAction,
} from "@/utils/redis/thunderbird-actions";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

export const thunderbirdInboxStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "applied",
]);

export const thunderbirdInboxItemSchema = z.object({
  id: z.string(),
  emailAccountId: z.string(),
  accountEmail: z.string(),
  messageId: z.string(),
  threadId: z.string(),
  thunderbirdMessageId: z.number().optional(),
  thunderbirdAccountId: z.string().optional(),
  subject: z.string(),
  from: z.string(),
  to: z.string().optional(),
  snippet: z.string().optional(),
  textPlain: z.string().optional(),
  messageDate: z.string().optional(),
  processedAt: z.string(),
  status: thunderbirdInboxStatusSchema,
  ruleNames: z.array(z.string()).default([]),
  reason: z.string().optional(),
  proposedActions: z.array(thunderbirdActionSchema).default([]),
});

export type ThunderbirdInboxItem = z.infer<typeof thunderbirdInboxItemSchema>;

type DbReviewStatus = "PENDING" | "APPROVED" | "REJECTED" | "APPLIED";

const statusToDb: Record<ThunderbirdInboxItem["status"], DbReviewStatus> = {
  pending: "PENDING",
  approved: "APPROVED",
  rejected: "REJECTED",
  applied: "APPLIED",
};

const statusFromDb: Record<DbReviewStatus, ThunderbirdInboxItem["status"]> = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  APPLIED: "applied",
};

export async function saveThunderbirdInboxItem(
  item: Omit<ThunderbirdInboxItem, "id" | "processedAt" | "status"> & {
    id?: string;
    status?: ThunderbirdInboxItem["status"];
  },
): Promise<ThunderbirdInboxItem> {
  const status = item.status || "pending";
  const row = await prisma.thunderbirdReviewItem.create({
    data: {
      ...(item.id ? { id: item.id } : {}),
      emailAccountId: item.emailAccountId,
      messageId: item.messageId,
      threadId: item.threadId,
      thunderbirdMessageId: item.thunderbirdMessageId,
      thunderbirdAccountId: item.thunderbirdAccountId,
      subject: item.subject,
      from: item.from,
      to: item.to,
      snippet: item.snippet,
      textPlain: item.textPlain,
      messageDate: parseMessageDate(item.messageDate),
      status: statusToDb[status],
      ruleNames: item.ruleNames || [],
      reason: item.reason,
      proposedActions: (item.proposedActions ||
        []) as unknown as Prisma.InputJsonValue,
    },
    include: { emailAccount: { select: { email: true } } },
  });

  return toInboxItem(row);
}

export async function listThunderbirdInboxItems(
  emailAccountId: string,
): Promise<ThunderbirdInboxItem[]> {
  const rows = await prisma.thunderbirdReviewItem.findMany({
    where: { emailAccountId },
    include: { emailAccount: { select: { email: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return rows.map(toInboxItem);
}

export async function getThunderbirdInboxItem(
  emailAccountId: string,
  itemId: string,
): Promise<ThunderbirdInboxItem | null> {
  const row = await prisma.thunderbirdReviewItem.findFirst({
    where: { id: itemId, emailAccountId },
    include: { emailAccount: { select: { email: true } } },
  });
  return row ? toInboxItem(row) : null;
}

export async function updateThunderbirdInboxItem(
  emailAccountId: string,
  itemId: string,
  patch: Partial<
    Pick<
      ThunderbirdInboxItem,
      "status" | "proposedActions" | "reason" | "ruleNames"
    >
  >,
): Promise<ThunderbirdInboxItem | null> {
  const existing = await prisma.thunderbirdReviewItem.findFirst({
    where: { id: itemId, emailAccountId },
    select: { id: true },
  });
  if (!existing) return null;

  const row = await prisma.thunderbirdReviewItem.update({
    where: { id: itemId },
    data: {
      status: patch.status ? statusToDb[patch.status] : undefined,
      reason: patch.reason,
      ruleNames: patch.ruleNames,
      proposedActions: patch.proposedActions
        ? (patch.proposedActions as unknown as Prisma.InputJsonValue)
        : undefined,
    },
    include: { emailAccount: { select: { email: true } } },
  });

  return toInboxItem(row);
}

export async function clearThunderbirdInbox(
  emailAccountId: string,
): Promise<number> {
  const result = await prisma.thunderbirdReviewItem.deleteMany({
    where: { emailAccountId },
  });
  return result.count;
}

export async function enqueueProposedActions(
  emailAccountId: string,
  actions: ThunderbirdBridgeAction[],
) {
  const { enqueueThunderbirdAction } = await import(
    "@/utils/redis/thunderbird-actions"
  );
  for (const action of actions) {
    await enqueueThunderbirdAction(emailAccountId, action);
  }
}

function toInboxItem(row: {
  id: string;
  emailAccountId: string;
  messageId: string;
  threadId: string;
  thunderbirdMessageId: number | null;
  thunderbirdAccountId: string | null;
  subject: string;
  from: string;
  to: string | null;
  snippet: string | null;
  textPlain: string | null;
  messageDate: Date | null;
  createdAt: Date;
  status: DbReviewStatus;
  ruleNames: string[];
  reason: string | null;
  proposedActions: Prisma.JsonValue;
  emailAccount: { email: string };
}): ThunderbirdInboxItem {
  return thunderbirdInboxItemSchema.parse({
    id: row.id,
    emailAccountId: row.emailAccountId,
    accountEmail: row.emailAccount.email,
    messageId: row.messageId,
    threadId: row.threadId,
    thunderbirdMessageId: row.thunderbirdMessageId ?? undefined,
    thunderbirdAccountId: row.thunderbirdAccountId ?? undefined,
    subject: row.subject,
    from: row.from,
    to: row.to ?? undefined,
    snippet: row.snippet ?? undefined,
    textPlain: row.textPlain ?? undefined,
    messageDate: row.messageDate?.toISOString(),
    processedAt: row.createdAt.toISOString(),
    status: statusFromDb[row.status],
    ruleNames: row.ruleNames,
    reason: row.reason ?? undefined,
    proposedActions: row.proposedActions ?? [],
  });
}

function parseMessageDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}
