"use server";

import { revalidatePath } from "next/cache";
import prisma from "@/utils/prisma";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import {
  type AddGroupItemBody,
  addGroupItemBody,
  type CreateGroupBody,
  createGroupBody,
} from "@/utils/actions/group.validation";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { addGroupItem, deleteGroupItem } from "@/utils/group/group-item";

export const createGroupAction = withActionInstrumentation(
  "createGroup",
  async (unsafeData: CreateGroupBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { error, data } = createGroupBody.safeParse(unsafeData);
    if (error) return { error: error.message };

    const rule = await prisma.rule.findUnique({
      where: { id: data.ruleId, userId: session.user.id },
      select: { name: true, groupId: true },
    });
    if (rule?.groupId) return { groupId: rule.groupId };
    if (!rule) return { error: "Rule not found" };

    const group = await prisma.group.create({
      data: {
        name: rule.name,
        userId: session.user.id,
        rule: {
          connect: { id: data.ruleId },
        },
      },
    });

    return { groupId: group.id };
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
