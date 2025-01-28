"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  type AddGroupItemBody,
  addGroupItemBody,
  type UpdateGroupPromptBody,
  updateGroupPromptBody,
} from "@/utils/actions/validation";
import { findNewsletters } from "@/utils/ai/group/find-newsletters";
import { findReceipts } from "@/utils/ai/group/find-receipts";
import { getGmailClient, getGmailAccessToken } from "@/utils/gmail/client";
import { GroupItemType } from "@prisma/client";
import {
  NEWSLETTER_GROUP_ID,
  RECEIPT_GROUP_ID,
} from "@/app/(app)/automation/create/examples";
import { GroupName } from "@/utils/config";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { addGroupItem, deleteGroupItem } from "@/utils/group/group-item";
import { createGroup } from "@/utils/group/group";

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

    const group = await createGroup({
      name,
      userId: session.user.id,
      items: newsletters.map((newsletter) => ({
        type: GroupItemType.FROM,
        value: newsletter,
      })),
    });

    revalidatePath("/automation");

    if ("error" in group) return { error: group.error };

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

    const group = await createGroup({
      name,
      userId: session.user.id,
      items: receipts,
    });

    revalidatePath("/automation");

    if ("error" in group) return { error: group.error };
    return { id: group.id };
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

    await addGroupItem(data);

    revalidatePath("/automation");
  },
);

export const deleteGroupItemAction = withActionInstrumentation(
  "deleteGroupItem",
  async (id: string) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await deleteGroupItem({ id, userId: session.user.id });

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
