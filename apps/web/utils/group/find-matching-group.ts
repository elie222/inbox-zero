import prisma from "@/utils/prisma";
import { ParsedMessage } from "@/utils/types";
import { GroupItemType } from "@prisma/client";

type Groups = Awaited<ReturnType<typeof getGroups>>;
export async function getGroups(userId: string) {
  return prisma.group.findMany({
    where: { userId },
    include: { items: true, rule: { include: { actions: true } } },
  });
}

export function findMatchingGroup(message: ParsedMessage, groups: Groups) {
  const group = groups.find((group) =>
    findMatchingGroupItem(message.headers, group.items),
  );
  return group;
}

export function findMatchingGroupItem(
  headers: { from: string; subject: string },
  groupItems: Groups[number]["items"],
) {
  const { from, subject } = headers;

  return groupItems.find((item) => {
    if (item.type === GroupItemType.FROM) {
      return item.value.includes(from);
    }

    if (item.type === GroupItemType.SUBJECT) {
      return item.value.includes(subject);
    }

    // TODO
    // if (item.type === GroupItemType.BODY) {
    //   return item.value.includes(body)
    // }

    return false;
  });
}
