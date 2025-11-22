"use server";

import { z } from "zod";
import prisma from "@/utils/prisma";
import {
  addGroupItemBody,
  createGroupBody,
} from "@/utils/actions/group.validation";
import { addGroupItem, deleteGroupItem } from "@/utils/group/group-item";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";

export const createGroupAction = actionClient
  .metadata({ name: "createGroup" })
  .inputSchema(createGroupBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { ruleId } }) => {
    const rule = await prisma.rule.findUnique({
      where: { id: ruleId, emailAccountId },
      select: { name: true, groupId: true },
    });
    if (rule?.groupId) return { groupId: rule.groupId };
    if (!rule) throw new SafeError("Rule not found");

    const group = await prisma.group.create({
      data: {
        name: rule.name,
        emailAccountId,
        rule: {
          connect: { id: ruleId },
        },
      },
    });

    return { groupId: group.id };
  });

export const addGroupItemAction = actionClient
  .metadata({ name: "addGroupItem" })
  .inputSchema(addGroupItemBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { groupId, type, value, exclude },
    }) => {
      const group = await prisma.group.findUnique({
        where: { id: groupId },
      });
      if (!group) throw new SafeError("Learned patterns group not found");
      if (group.emailAccountId !== emailAccountId)
        throw new SafeError(
          "You don't have permission to add this learned pattern",
        );

      await addGroupItem({ groupId, type, value, exclude });
    },
  );

export const deleteGroupItemAction = actionClient
  .metadata({ name: "deleteGroupItem" })
  .inputSchema(z.object({ id: z.string() }))
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await deleteGroupItem({ id, emailAccountId });
  });
