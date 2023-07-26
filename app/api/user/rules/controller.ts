import prisma from "@/utils/prisma";
import {
  DeleteRulesBody,
  UpdateRulesBody,
  updateRulesBody,
} from "@/app/api/user/rules/validation";

// GET

export type RulesResponse = Awaited<ReturnType<typeof getRules>>;

export async function getRules(options: { userId: string }) {
  return await prisma.rule.findMany({
    where: {
      userId: options.userId,
    },
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
  const deleteOperations = rulesToDelete.map((rule) =>
    prisma.rule.delete({ where: { id: rule.id } })
  );

  // Prepare the upsert operations
  const upsertOperations = body.rules.map((rule) =>
    prisma.rule.upsert({
      where: { id: rule.id },
      update: { instructions: rule.value },
      create: {
        instructions: rule.value,
        user: { connect: { id: userId } },
      },
    })
  );

  // Perform all operations in a single transaction
  await prisma.$transaction([...deleteOperations, ...upsertOperations]);

  // Return the updated user
  return await prisma.rule.findMany({ where: { userId } });
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
