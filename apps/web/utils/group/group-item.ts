import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { GroupItemSource, type GroupItemType } from "@/generated/prisma/enums";

export async function addGroupItem(data: {
  groupId: string;
  type: GroupItemType;
  value: string;
  exclude?: boolean;
}) {
  return saveGroupItem({
    ...data,
    source: GroupItemSource.USER,
  });
}

export async function saveGroupItem({
  groupId,
  type,
  value,
  exclude = false,
  reason,
  threadId,
  messageId,
  source,
}: {
  groupId: string;
  type: GroupItemType;
  value: string;
  exclude?: boolean;
  reason?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  source?: GroupItemSource | null;
}) {
  const normalizedValue = normalizeGroupItemValue(value);
  if (!normalizedValue) throw new Error("Learned pattern cannot be empty");

  const updateData = {
    exclude,
    reason,
    threadId,
    messageId,
    source,
  };
  const updateWhere = {
    groupId,
    type,
    value: normalizedValue,
    ...(source !== GroupItemSource.USER && {
      OR: [{ source: null }, { source: { not: GroupItemSource.USER } }],
    }),
  };

  const updated = await prisma.groupItem.updateMany({
    where: updateWhere,
    data: updateData,
  });
  if (updated.count > 0) return;

  try {
    return await prisma.groupItem.create({
      data: {
        groupId,
        type,
        value: normalizedValue,
        ...updateData,
      },
    });
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
  }

  await prisma.groupItem.updateMany({
    where: updateWhere,
    data: updateData,
  });
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

function normalizeGroupItemValue(value: string) {
  return value.trim().toLowerCase();
}
