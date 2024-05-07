"use server";

import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  AddGroupItemBody,
  addGroupItemBody,
  CreateGroupBody,
  createGroupBody,
} from "@/utils/actions/validation";
import { findNewsletters } from "@/utils/ai/group/find-newsletters";
import { findReceipts } from "@/utils/ai/group/find-receipts";
import { getGmailClient, getGmailAccessToken } from "@/utils/gmail/client";
import { GroupItemType } from "@prisma/client";

export async function createGroupAction(body: CreateGroupBody) {
  const { name, prompt } = createGroupBody.parse(body);
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.group.create({
    data: { name, prompt, userId: session.user.id },
  });
}

export async function createNewsletterGroupAction(body: CreateGroupBody) {
  const { name } = createGroupBody.parse(body);
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

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

export async function createReceiptGroupAction({ name }: CreateGroupBody) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

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

export async function deleteGroupAction(id: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.group.delete({ where: { id, userId: session.user.id } });
}

export async function addGroupItemAction(body: AddGroupItemBody) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.groupItem.create({ data: addGroupItemBody.parse(body) });
}

export async function deleteGroupItemAction(id: string) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.groupItem.delete({
    where: { id, group: { userId: session.user.id } },
  });
}
