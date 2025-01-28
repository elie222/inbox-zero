import type { gmail_v1 } from "@googleapis/gmail";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { GroupItemType, type Prisma } from "@prisma/client";
import { GroupName } from "@/utils/config";
import { findNewsletters } from "@/utils/ai/group/find-newsletters";
import { findReceipts } from "@/utils/ai/group/find-receipts";

export async function createGroup({
  userId,
  ruleId,
  name,
  items,
}: {
  userId: string;
  ruleId?: string;
  name: string;
  items?: Prisma.GroupItemCreateManyInput[];
}) {
  try {
    const group = await prisma.group.create({
      data: {
        name,
        userId,
        items: { create: items },
        rule: ruleId ? { connect: { id: ruleId } } : undefined,
      },
    });

    return group;
  } catch (error) {
    if (isDuplicateError(error, "name"))
      return { error: "Group with this name already exists" };

    throw error;
  }
}

export async function createNewsletterGroup({
  gmail,
  accessToken,
  userId,
  userEmail,
}: {
  gmail: gmail_v1.Gmail;
  accessToken: string;
  userId: string;
  userEmail: string;
}) {
  const name = GroupName.NEWSLETTER;
  const existingGroup = await prisma.group.findFirst({
    where: { name, userId },
    select: { id: true },
  });
  if (existingGroup) return { id: existingGroup.id };

  const newsletters = await findNewsletters(gmail, accessToken, userEmail);

  const group = await createGroup({
    name,
    userId,
    items: newsletters.map((newsletter) => ({
      type: GroupItemType.FROM,
      value: newsletter,
    })),
  });

  return group;
}

export async function createReceiptGroup({
  gmail,
  accessToken,
  userId,
  userEmail,
}: {
  gmail: gmail_v1.Gmail;
  accessToken: string;
  userId: string;
  userEmail: string;
}) {
  const name = GroupName.RECEIPT;
  const existingGroup = await prisma.group.findFirst({
    where: { name, userId },
    select: { id: true },
  });
  if (existingGroup) return { id: existingGroup.id };

  const receipts = await findReceipts(gmail, accessToken, userEmail);

  const group = await createGroup({
    name,
    userId,
    items: receipts,
  });

  return group;
}
