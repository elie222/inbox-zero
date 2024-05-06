"use server";

import {
  CreateRuleBody,
  createRuleBody,
  UpdateRuleBody,
  updateRuleBody,
} from "@/utils/actions/validation";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";

export async function createRuleAction(options: CreateRuleBody) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const body = createRuleBody.parse(options);

  const rule = await prisma.rule.create({
    data: {
      name: body.name || "",
      instructions: body.instructions || "",
      automate: body.automate ?? undefined,
      runOnThreads: body.runOnThreads ?? undefined,
      actions: body.actions
        ? {
            createMany: {
              data: body.actions,
            },
          }
        : undefined,
      userId: session.user.id,
      from: body.from || undefined,
      to: body.to || undefined,
      subject: body.subject || undefined,
      body: body.body || undefined,
      groupId: body.groupId || undefined,
    },
  });

  return { rule };
}

export async function updateRuleAction(options: UpdateRuleBody) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  const body = updateRuleBody.parse(options);

  const [, rule] = await prisma.$transaction([
    prisma.action.deleteMany({ where: { ruleId: body.id } }),
    prisma.rule.update({
      where: { id: body.id, userId: session.user.id },
      data: {
        instructions: body.instructions || "",
        automate: body.automate ?? undefined,
        runOnThreads: body.runOnThreads ?? undefined,
        name: body.name || undefined,
        actions: body.actions
          ? {
              createMany: { data: body.actions },
            }
          : undefined,
        from: body.from,
        to: body.to,
        subject: body.subject,
        body: body.body,
        groupId: body.groupId,
      },
    }),
  ]);

  return { rule };
}

export async function deleteRuleAction(params: { id: string }) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  return await prisma.rule.delete({
    where: {
      id: params.id,
      userId: session.user.id,
    },
  });
}
