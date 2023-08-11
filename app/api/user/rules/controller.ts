import prisma from "@/utils/prisma";
import {
  DeleteRulesBody,
  UpdateRulesBody,
} from "@/app/api/user/rules/validation";
import { isDefined } from "@/utils/types";

// GET
export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

export async function getRules(options: { userId: string }) {
  return await prisma.rule.findMany({
    where: { userId: options.userId },
    include: { actions: true },
    orderBy: { createdAt: "asc" },
  });
}

// POST
export type UpdateRulesResponse = Awaited<ReturnType<typeof updateRules>>;

export async function updateRules({
  userId,
  body,
}: {
  userId: string;
  body: UpdateRulesBody;
}) {
  // First, get the current rules
  const currentRules = await prisma.rule.findMany({
    where: { userId },
  });

  // Then, delete the rules that are not in the new set
  const rulesToDelete = currentRules.filter(
    (cr) => !body.rules.some((br) => br.id === cr.id)
  );

  // Prepare the delete operations
  const deleteOperations = prisma.rule.deleteMany({
    where: { id: { in: rulesToDelete.map((r) => r.id) } },
  });

  // Prepare the update operations
  const upsertOperations = body.rules
    .filter((rule) => rule.id)
    .map((rule, i) => {
      return prisma.rule.update({
        where: { id: rule.id },
        data: {
          name: rule.name || `Rule ${i + 1}`,
          instructions: rule.instructions || undefined,
          automate: rule.automate ?? false,
          // actions: rule.actions,
        },
      });
    });

  // Prepare the create operations
  const createOperations = body.rules
    .filter((rule) => !rule.id)
    .map((rule, i) => {
      if (!rule.instructions) return;
      return prisma.rule.create({
        data: {
          name: rule.name || `Rule ${upsertOperations.length + i + 1}`,
          instructions: rule.instructions,
          automate: rule.automate ?? false,
          // actions: rule.actions,
          user: { connect: { id: userId } },
        },
      });
    })
    .filter(isDefined);

  // Perform all operations in a single transaction
  await prisma.$transaction([
    deleteOperations,
    ...upsertOperations,
    ...createOperations,
  ]);

  // Return the updated user
  return await prisma.rule.findMany({
    where: { userId },
    include: { actions: true },
  });
}

// DELETE
export async function deleteRule(body: DeleteRulesBody, userId: string) {
  await prisma.rule.delete({
    where: {
      id: body.ruleId,
      userId,
    },
  });
}
