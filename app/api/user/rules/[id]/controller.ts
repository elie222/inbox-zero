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

export async function updateRule(options: {
  id: string;
  userId: string;
  body: UpdateRuleBody;
}) {
  const [, rule] = await prisma.$transaction([
    prisma.action.deleteMany({
      where: {
        ruleId: options.id,
      },
    }),
    prisma.rule.update({
      where: {
        id: options.id,
        userId: options.userId,
      },
      data: {
        instructions: options.body.instructions || undefined,
        automate: options.body.automate ?? undefined,
        name: options.body.name || undefined,
        actions: options.body.actions
          ? {
              createMany: {
                data: options.body.actions,
              },
            }
          : undefined,
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
