"use server";

import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  type AddGroupItemBody,
  addGroupItemBody,
  type CreateGroupBody,
  createGroupBody,
} from "@/utils/actions/validation";
import { findNewsletters } from "@/utils/ai/group/find-newsletters";
import { findReceipts } from "@/utils/ai/group/find-receipts";
import { getGmailClient, getGmailAccessToken } from "@/utils/gmail/client";
import { GroupItemType } from "@prisma/client";
import type { ServerActionResponse } from "@/utils/error";
import {
  NEWSLETTER_GROUP_ID,
  RECEIPT_GROUP_ID,
} from "@/app/(app)/automation/create/examples";

export async function createGroupAction(
  body: CreateGroupBody,
): Promise<ServerActionResponse> {
  const { name, prompt } = createGroupBody.parse(body);
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  try {
    await prisma.group.create({
      data: { name, prompt, userId: session.user.id },
    });
  } catch (error) {
    return { error: "Error creating group" };
  }
}

export async function createPredefinedGroupAction(
  groupId: string,
): Promise<ServerActionResponse<{ id: string }>> {
  if (groupId === NEWSLETTER_GROUP_ID) {
    return await createNewsletterGroupAction();
  } else if (groupId === RECEIPT_GROUP_ID) {
    return await createReceiptGroupAction();
  }

  return { error: "Unknown group type" };
}

export async function createNewsletterGroupAction(): Promise<
  ServerActionResponse<{ id: string }>
> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  const name = "Newsletters";
  const existingGroup = await prisma.group.findFirst({
    where: { name, userId: session.user.id },
    select: { id: true },
  });
  if (existingGroup) return { id: existingGroup.id };

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const newsletters = await findNewsletters(gmail, token.token!);

  const group = await prisma.group.create({
    data: {
      name,
      userId: session.user.id,
      items: {
        create: newsletters.map((newsletter) => ({
          type: GroupItemType.FROM,
          value: newsletter,
        })),
      },
    },
  });

  return { id: group.id };
}

export async function createReceiptGroupAction(): Promise<
  ServerActionResponse<{ id: string }>
> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  const name = "Receipts";
  const existingGroup = await prisma.group.findFirst({
    where: { name, userId: session.user.id },
    select: { id: true },
  });
  if (existingGroup) return { id: existingGroup.id };

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);
  const receipts = await findReceipts(gmail, token.token!);

  const group = await prisma.group.create({
    data: {
      name,
      userId: session.user.id,
      items: { create: receipts },
    },
  });

  return { id: group.id };
}

export async function deleteGroupAction(
  id: string,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  await prisma.group.delete({ where: { id, userId: session.user.id } });
}

export async function addGroupItemAction(
  body: AddGroupItemBody,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  const group = await prisma.group.findUnique({ where: { id: body.groupId } });
  if (!group) return { error: "Group not found" };
  if (group.userId !== session.user.id)
    return { error: "You don't have permission to add items to this group" };

  await prisma.groupItem.create({ data: addGroupItemBody.parse(body) });
}

export async function deleteGroupItemAction(
  id: string,
): Promise<ServerActionResponse> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  await prisma.groupItem.delete({
    where: { id, group: { userId: session.user.id } },
  });
}
