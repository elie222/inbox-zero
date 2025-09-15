import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type { GroupItemType } from "@prisma/client";
import { captureException } from "@/utils/error";

export async function addGroupItem(data: {
  groupId: string;
  type: GroupItemType;
  value: string;
  exclude?: boolean;
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
  emailAccountId,
}: {
  id: string;
  emailAccountId: string;
}) {
  await prisma.groupItem.delete({
    where: { id, group: { emailAccountId } },
  });
}
