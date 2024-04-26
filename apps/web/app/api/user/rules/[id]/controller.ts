import "server-only";
import prisma from "@/utils/prisma";
import { type UpdateRuleBody } from "@/app/api/user/rules/[id]/validation";

export async function getRule(options: { id: string; userId: string }) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: {
      id: options.id,
      userId: options.userId,
    },
  });
  return { rule };
}

export async function createRule({
  userId,
  body,
}: {
  userId: string;
  body: UpdateRuleBody;
}) {
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
      userId,
      from: body.from || undefined,
      to: body.to || undefined,
      subject: body.subject || undefined,
      body: body.body || undefined,
      groupId: body.groupId || undefined,
    },
  });

  return { rule };
}

export async function updateRule({
  id,
  userId,
  body,
}: {
  id: string;
  userId: string;
  body: UpdateRuleBody;
}) {
  const [, rule] = await prisma.$transaction([
    prisma.action.deleteMany({ where: { ruleId: id } }),
    prisma.rule.update({
      where: { id, userId },
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

export async function deleteRule(options: { id: string; userId: string }) {
  return await prisma.rule.delete({
    where: {
      id: options.id,
      userId: options.userId,
    },
  });
}
