import prisma from "@/utils/prisma";
import { generalizeSubject } from "@/utils/string";
import type { ParsedMessage } from "@/utils/types";
import { type GroupItem, GroupItemType } from "@prisma/client";

type GroupsWithRules = Awaited<ReturnType<typeof getGroupsWithRules>>;
export async function getGroupsWithRules(userId: string) {
  return prisma.group.findMany({
    where: { userId, rule: { isNot: null } },
    include: { items: true, rule: { include: { actions: true } } },
  });
}

export function findMatchingGroup(
  message: ParsedMessage,
  groups: GroupsWithRules,
) {
  for (const group of groups) {
    const matchingItem = findMatchingGroupItem(message.headers, group.items);
    if (matchingItem) {
      return { group, matchingItem };
    }
  }
  return { group: null, matchingItem: null };
}

export function findMatchingGroupItem<
  T extends Pick<GroupItem, "type" | "value">,
>(headers: { from: string; subject: string }, groupItems: T[]) {
  const { from, subject } = headers;

  const matchingItem = groupItems.find((item) => {
    if (item.type === GroupItemType.FROM && from) {
      return item.value.includes(from) || from.includes(item.value);
    }

    if (item.type === GroupItemType.SUBJECT && subject) {
      const subjectWithoutNumbers = generalizeSubject(subject);
      const valueWithoutNumbers = generalizeSubject(item.value);

      return (
        subject.includes(item.value) ||
        subjectWithoutNumbers.includes(valueWithoutNumbers)
      );
    }

    // TODO
    // if (item.type === GroupItemType.BODY && body) {
    //   return item.value.includes(body)
    // }

    return false;
  });

  return matchingItem;
}
