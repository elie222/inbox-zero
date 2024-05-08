import { removeNumbersFromSubject } from "@/utils/ai/group/find-receipts";
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
    if (item.type === GroupItemType.FROM && from) {
      return item.value.includes(from) || from.includes(item.value);
    }

    if (item.type === GroupItemType.SUBJECT && subject) {
      const subjectWithoutNumbers = removeNumbersFromSubject(subject);
      const valueWithoutNumbers = removeNumbersFromSubject(item.value);

      return (
        item.value.includes(subject) ||
        subject.includes(item.value) ||
        valueWithoutNumbers.includes(subjectWithoutNumbers) ||
        subjectWithoutNumbers.includes(valueWithoutNumbers)
      );
    }

    // TODO
    // if (item.type === GroupItemType.BODY && body) {
    //   return item.value.includes(body)
    // }

    return false;
  });
}
