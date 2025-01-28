import prisma, { isDuplicateError } from "@/utils/prisma";
import type { Prisma } from "@prisma/client";

export async function createGroup({
  userId,
  ruleId,
  name,
  items,
}: {
  userId: string;
  ruleId?: string;
  name: string;
  items?: Prisma.GroupItemCreateManyInput[];
}) {
  try {
    const group = await prisma.group.create({
      data: {
        name,
        userId,
        items: { create: items },
        rule: ruleId ? { connect: { id: ruleId } } : undefined,
      },
    });

    return group;
  } catch (error) {
    if (isDuplicateError(error, "name"))
      return { error: "Group with this name already exists" };

    throw error;
  }
}
