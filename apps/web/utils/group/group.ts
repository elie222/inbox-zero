import prisma, { isDuplicateError } from "@/utils/prisma";
import type { Prisma } from "@prisma/client";

export async function createGroup({
  userId,
  name,
  prompt,
  items,
}: {
  userId: string;
  name: string;
  prompt?: string;
  items?: Prisma.GroupItemCreateManyInput[];
}) {
  try {
    const group = await prisma.group.create({
      data: {
        name,
        prompt,
        userId,
        items: { create: items },
      },
    });

    return group;
  } catch (error) {
    if (isDuplicateError(error, "name"))
      return { error: "Group with this name already exists" };

    throw error;
  }
}
