import prisma, { isDuplicateError } from "@/utils/prisma";
import type { GroupItemType } from "@prisma/client";
import { captureException } from "@/utils/error";

export async function addGroupItem(data: {
  groupId: string;
  type: GroupItemType;
  value: string;
}) {
  try {
    return await prisma.groupItem.create({ data });
  } catch (error) {
    if (isDuplicateError(error)) {
      captureException(error, { extra: { items: data } });
    } else {
      throw error;
    }
  }
}

export async function deleteGroupItem({
  id,
  userId,
}: {
  id: string;
  userId: string;
}) {
  await prisma.groupItem.delete({ where: { id, group: { userId } } });
}
