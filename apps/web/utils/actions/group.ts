"use server";

import { revalidatePath } from "next/cache";
import type { gmail_v1 } from "@googleapis/gmail";
import prisma, { isDuplicateError } from "@/utils/prisma";
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
import { GroupItemType, Prisma, User } from "@prisma/client";
import { captureException, type ServerActionResponse } from "@/utils/error";
import {
  NEWSLETTER_GROUP_ID,
  RECEIPT_GROUP_ID,
} from "@/app/(app)/automation/create/examples";
import { GroupName } from "@/utils/config";
import { aiGenerateGroupItems } from "@/utils/ai/group/create-group";
import { UserAIFields } from "@/utils/llms/types";
import { withActionInstrumentation } from "@/utils/actions/middleware";

export const createGroupAction = withActionInstrumentation(
  "createGroup",
  async (body: CreateGroupBody) => {
    const { name, prompt } = createGroupBody.parse(body);
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    try {
      const group = await prisma.group.create({
        data: { name, prompt, userId: session.user.id },
      });

      if (prompt) {
        const gmail = getGmailClient(session);
        const token = await getGmailAccessToken(session);

        const user = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: {
            email: true,
            aiModel: true,
            aiProvider: true,
            aiApiKey: true,
          },
        });
        if (!user) return { error: "User not found" };
        if (!token.token) return { error: "No access token" };

        await generateGroupItemsFromPrompt(
          group.id,
          user,
          gmail,
          token.token,
          name,
          prompt,
        );
      }

      revalidatePath(`/automation`);
    } catch (error) {
      if (isDuplicateError(error, "name"))
        return { error: "Group with this name already exists" };

      console.error("Error creating group", error);
      captureException(error, { extra: { name, prompt } }, session?.user.email);
      return { error: "Error creating group" };
    }
  },
);

async function generateGroupItemsFromPrompt(
  groupId: string,
  user: Pick<User, "email"> & UserAIFields,
  gmail: gmail_v1.Gmail,
  token: string,
  name: string,
  prompt: string,
) {
  const result = await aiGenerateGroupItems(user, gmail, token, {
    name,
    prompt,
  });

  await prisma.$transaction([
    ...result.senders.map((sender) =>
      prisma.groupItem.upsert({
        where: {
          groupId_type_value: {
            groupId,
            type: GroupItemType.FROM,
            value: sender,
          },
        },
        update: {}, // No update needed if it exists
        create: {
          type: GroupItemType.FROM,
          value: sender,
          groupId,
        },
      }),
    ),
    ...result.subjects.map((subject) =>
      prisma.groupItem.upsert({
        where: {
          groupId_type_value: {
            groupId,
            type: GroupItemType.SUBJECT,
            value: subject,
          },
        },
        update: {}, // No update needed if it exists
        create: {
          type: GroupItemType.SUBJECT,
          value: subject,
          groupId,
        },
      }),
    ),
  ]);
}

export const createPredefinedGroupAction = withActionInstrumentation(
  "createPredefinedGroup",
  async (groupId: string) => {
    if (groupId === NEWSLETTER_GROUP_ID) {
      return await createNewsletterGroupAction();
    } else if (groupId === RECEIPT_GROUP_ID) {
      return await createReceiptGroupAction();
    }

    return { error: "Unknown group type" };
  },
);

export async function createNewsletterGroupAction(): Promise<
  ServerActionResponse<{ id: string }>
> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  const name = GroupName.NEWSLETTER;
  const existingGroup = await prisma.group.findFirst({
    where: { name, userId: session.user.id },
    select: { id: true },
  });
  if (existingGroup) return { id: existingGroup.id };

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return { error: "No access token" };

  const newsletters = await findNewsletters(gmail, token.token);

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

  revalidatePath(`/automation`);

  return { id: group.id };
}

export async function createReceiptGroupAction(): Promise<
  ServerActionResponse<{ id: string }>
> {
  const session = await auth();
  if (!session?.user.id) return { error: "Not logged in" };

  const name = GroupName.RECEIPT;
  const existingGroup = await prisma.group.findFirst({
    where: { name, userId: session.user.id },
    select: { id: true },
  });
  if (existingGroup) return { id: existingGroup.id };

  const gmail = getGmailClient(session);
  const token = await getGmailAccessToken(session);

  if (!token.token) return { error: "No access token" };

  const receipts = await findReceipts(gmail, token.token);

  const group = await prisma.group.create({
    data: {
      name,
      userId: session.user.id,
      items: { create: receipts },
    },
  });

  revalidatePath(`/automation`);

  return { id: group.id };
}

type ExistingGroup = Prisma.GroupGetPayload<{
  select: {
    id: true;
    name: true;
    prompt: true;
    items: { select: { id: true; type: true; value: true } };
  };
}>;

export const regenerateGroupAction = withActionInstrumentation(
  "regenerateGroup",
  async (groupId: string) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const existingGroup = await prisma.group.findUnique({
      where: { id: groupId, userId: session.user.id },
      select: {
        id: true,
        name: true,
        prompt: true,
        items: { select: { id: true, type: true, value: true } },
      },
    });
    if (!existingGroup) return { error: "Group not found" };

    const gmail = getGmailClient(session);
    const token = await getGmailAccessToken(session);

    if (!token.token) return { error: "No access token" };

    if (existingGroup.name === GroupName.NEWSLETTER) {
      await regenerateNewsletterGroup(existingGroup, gmail, token.token);
      return;
    } else if (existingGroup.name === GroupName.RECEIPT) {
      await regenerateReceiptGroup(existingGroup, gmail, token.token);
      return;
    } else if (existingGroup.prompt) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: {
          email: true,
          aiModel: true,
          aiProvider: true,
          aiApiKey: true,
        },
      });
      if (!user) return { error: "User not found" };

      await generateGroupItemsFromPrompt(
        groupId,
        user,
        gmail,
        token.token,
        existingGroup.name,
        existingGroup.prompt,
      );
    }
  },
);

async function regenerateNewsletterGroup(
  existingGroup: ExistingGroup,
  gmail: gmail_v1.Gmail,
  token: string,
) {
  const newsletters = await findNewsletters(gmail, token);

  const newItems = newsletters.filter(
    (newItem) =>
      !existingGroup.items.find(
        (item) => item.value === newItem && item.type === GroupItemType.FROM,
      ),
  );

  await prisma.groupItem.createMany({
    data: newItems.map((item) => ({
      type: GroupItemType.FROM,
      value: item,
      groupId: existingGroup.id,
    })),
  });

  revalidatePath(`/automation`);

  return;
}

async function regenerateReceiptGroup(
  existingGroup: ExistingGroup,
  gmail: gmail_v1.Gmail,
  token: string,
) {
  const receipts = await findReceipts(gmail, token);

  const newItems = receipts.filter(
    (newItem) =>
      !existingGroup.items.find(
        (item) => item.value === newItem.value && item.type === newItem.type,
      ),
  );

  await prisma.groupItem.createMany({
    data: newItems.map((item) => ({
      type: GroupItemType.FROM,
      value: item.value,
      groupId: existingGroup.id,
    })),
  });

  revalidatePath(`/automation`);

  return;
}

export const deleteGroupAction = withActionInstrumentation(
  "deleteGroup",
  async (id: string) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.group.delete({ where: { id, userId: session.user.id } });

    revalidatePath(`/automation`);
  },
);

export const addGroupItemAction = withActionInstrumentation(
  "addGroupItem",
  async (body: AddGroupItemBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const group = await prisma.group.findUnique({
      where: { id: body.groupId },
    });
    if (!group) return { error: "Group not found" };
    if (group.userId !== session.user.id)
      return { error: "You don't have permission to add items to this group" };

    await prisma.groupItem.create({ data: addGroupItemBody.parse(body) });

    revalidatePath(`/automation`);
  },
);

export const deleteGroupItemAction = withActionInstrumentation(
  "deleteGroupItem",
  async (id: string) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.groupItem.delete({
      where: { id, group: { userId: session.user.id } },
    });

    revalidatePath(`/automation`);
  },
);
