"use server";

import { revalidatePath } from "next/cache";
import type { gmail_v1 } from "@googleapis/gmail";
import uniqBy from "lodash/uniqBy";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  type AddGroupItemBody,
  addGroupItemBody,
  type CreateGroupBody,
  createGroupBody,
  type UpdateGroupPromptBody,
  updateGroupPromptBody,
} from "@/utils/actions/validation";
import { findNewsletters } from "@/utils/ai/group/find-newsletters";
import { findReceipts } from "@/utils/ai/group/find-receipts";
import { getGmailClient, getGmailAccessToken } from "@/utils/gmail/client";
import { GroupItemType, type Prisma, type User } from "@prisma/client";
import { captureException } from "@/utils/error";
import {
  NEWSLETTER_GROUP_ID,
  RECEIPT_GROUP_ID,
} from "@/app/(app)/automation/create/examples";
import { GroupName } from "@/utils/config";
import { aiGenerateGroupItems } from "@/utils/ai/group/create-group";
import type { UserAIFields } from "@/utils/llms/types";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("Group Action");

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

      revalidatePath("/automation");

      return { id: group.id };
    } catch (error) {
      if (isDuplicateError(error, "name"))
        return { error: "Group with this name already exists" };

      logger.error("Error creating group", { error, name, prompt });
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
  logger.info("generateGroupItemsFromPrompt", { name, prompt });

  const result = await aiGenerateGroupItems(user, gmail, token, {
    name,
    prompt,
  });

  logger.info("generateGroupItemsFromPrompt result", {
    name,
    senders: result.senders.length,
    subjects: result.subjects.length,
  });

  await prisma.$transaction([
    ...result.senders
      .filter((sender) => !sender.includes(user.email!))
      .map((sender) =>
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
    }
    if (groupId === RECEIPT_GROUP_ID) {
      return await createReceiptGroupAction();
    }

    return { error: "Unknown group type" };
  },
);

export const createNewsletterGroupAction = withActionInstrumentation(
  "createNewsletterGroup",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const name = GroupName.NEWSLETTER;
    const existingGroup = await prisma.group.findFirst({
      where: { name, userId: session.user.id },
      select: { id: true },
    });
    if (existingGroup) return { id: existingGroup.id };

    const gmail = getGmailClient(session);
    const token = await getGmailAccessToken(session);

    if (!token.token) return { error: "No access token" };

    const newsletters = await findNewsletters(
      gmail,
      token.token,
      session.user.email,
    );

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

    revalidatePath("/automation");

    return { id: group.id };
  },
);

export const createReceiptGroupAction = withActionInstrumentation(
  "createReceiptGroup",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const name = GroupName.RECEIPT;
    const existingGroup = await prisma.group.findFirst({
      where: { name, userId: session.user.id },
      select: { id: true },
    });
    if (existingGroup) return { id: existingGroup.id };

    const gmail = getGmailClient(session);
    const token = await getGmailAccessToken(session);

    if (!token.token) return { error: "No access token" };

    const receipts = await findReceipts(gmail, token.token, session.user.email);

    const group = await prisma.group.create({
      data: {
        name,
        userId: session.user.id,
        items: { create: receipts },
      },
    });

    revalidatePath("/automation");

    return { id: group.id };
  },
);

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
    if (!session?.user.email) return { error: "Not logged in" };

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
      await regenerateNewsletterGroup(
        existingGroup,
        gmail,
        token.token,
        session.user.email,
      );
    } else if (existingGroup.name === GroupName.RECEIPT) {
      await regenerateReceiptGroup(
        existingGroup,
        gmail,
        token.token,
        session.user.email,
      );
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
    } else {
      return { error: "Invalid group type or missing prompt" };
    }

    revalidatePath("/automation");
  },
);

async function regenerateNewsletterGroup(
  existingGroup: ExistingGroup,
  gmail: gmail_v1.Gmail,
  token: string,
  userEmail: string,
) {
  const newsletters = await findNewsletters(gmail, token, userEmail);

  const items = newsletters.map((item) => ({
    type: GroupItemType.FROM,
    value: item,
    groupId: existingGroup.id,
  }));
  const newItems = filterOutExisting(items, existingGroup.items);

  await createGroupItems(newItems);

  revalidatePath("/automation");
}

async function regenerateReceiptGroup(
  existingGroup: ExistingGroup,
  gmail: gmail_v1.Gmail,
  token: string,
  userEmail: string,
) {
  const receipts = await findReceipts(gmail, token, userEmail);
  const newItems = filterOutExisting(receipts, existingGroup.items);

  await createGroupItems(
    newItems.map((item) => ({
      ...item,
      groupId: existingGroup.id,
    })),
  );

  revalidatePath("/automation");
}

async function createGroupItems(
  data: { groupId: string; type: GroupItemType; value: string }[],
) {
  try {
    return await prisma.groupItem.createMany({ data });
  } catch (error) {
    if (isDuplicateError(error))
      captureException(error, { extra: { items: data } });

    throw error;
  }
}

function filterOutExisting<T extends { type: GroupItemType; value: string }>(
  newItems: T[],
  existingItems: { type: GroupItemType; value: string }[],
) {
  const filtered = newItems.filter(
    (newItem) =>
      !existingItems.find(
        (item) => item.value === newItem.value && item.type === newItem.type,
      ),
  );

  return uniqBy(filtered, (item) => `${item.value}-${item.type}`);
}

export const deleteGroupAction = withActionInstrumentation(
  "deleteGroup",
  async (id: string) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.group.delete({ where: { id, userId: session.user.id } });

    revalidatePath("/automation");
  },
);

export const addGroupItemAction = withActionInstrumentation(
  "addGroupItem",
  async (unsafeData: AddGroupItemBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { error, data } = addGroupItemBody.safeParse(unsafeData);
    if (error) return { error: error.message };

    const group = await prisma.group.findUnique({
      where: { id: data.groupId },
    });
    if (!group) return { error: "Group not found" };
    if (group.userId !== session.user.id)
      return { error: "You don't have permission to add items to this group" };

    await prisma.groupItem.create({ data });

    revalidatePath("/automation");
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

    revalidatePath("/automation");
  },
);

export const updateGroupPromptAction = withActionInstrumentation(
  "updateGroupPrompt",
  async (unsafeData: UpdateGroupPromptBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { success, error, data } =
      updateGroupPromptBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    await prisma.group.update({
      where: { id: data.groupId, userId: session.user.id },
      data: { prompt: data.prompt },
    });
  },
);
