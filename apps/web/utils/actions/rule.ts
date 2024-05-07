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
      type: body.type,
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

  const currentRule = await prisma.rule.findUniqueOrThrow({
    where: { id: body.id, userId: session.user.id },
    include: { actions: true },
  });
  const currentActions = currentRule.actions;

  const actionsToDelete = currentActions.filter(
    (currentAction) => !body.actions.find((a) => a.id === currentAction.id),
  );
  const actionsToUpdate = currentActions.filter((currentAction) =>
    body.actions.find((a) => a.id === currentAction.id),
  );
  const actionsToCreate = body.actions.filter((a) => !a.id);

  const [rule] = await prisma.$transaction([
    // update rule
    prisma.rule.update({
      where: { id: body.id, userId: session.user.id },
      data: {
        type: body.type,
        instructions: body.instructions || "",
        automate: body.automate ?? undefined,
        runOnThreads: body.runOnThreads ?? undefined,
        name: body.name || undefined,
        from: body.from,
        to: body.to,
        subject: body.subject,
        body: body.body,
        groupId: body.groupId,
      },
    }),
    // delete removed actions
    ...(actionsToDelete.length
      ? [
          prisma.action.deleteMany({
            where: { id: { in: actionsToDelete.map((a) => a.id) } },
          }),
        ]
      : []),
    // update existing actions
    ...(actionsToUpdate.length
      ? [
          prisma.action.updateMany({
            where: { id: { in: actionsToUpdate.map((a) => a.id) } },
            data: actionsToUpdate.map((a) => ({
              type: a.type,
              label: a.label,
              subject: a.subject,
              content: a.content,
              to: a.to,
              cc: a.cc,
              bcc: a.bcc,
            })),
          }),
        ]
      : []),
    // create new actions
    ...(actionsToCreate.length
      ? [
          prisma.action.createMany({
            data: actionsToCreate.map((a) => ({
              ruleId: body.id,
              type: a.type,
              label: a.label,
              subject: a.subject,
              content: a.content,
              to: a.to,
              cc: a.cc,
              bcc: a.bcc,
            })),
          }),
        ]
      : []),
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
