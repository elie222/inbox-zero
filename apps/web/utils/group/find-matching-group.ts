import prisma from "@/utils/prisma";
import { generalizeSubject } from "@/utils/string";
import type { ParsedMessage } from "@/utils/types";
import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import type { GroupItem } from "@/generated/prisma/client";

export type GroupsWithRules = Awaited<ReturnType<typeof getGroupsWithRules>>;

export async function getGroupsWithRules({
  emailAccountId,
  enabledOnly = true,
}: {
  emailAccountId: string;
  enabledOnly?: boolean;
}) {
  return prisma.group.findMany({
    where: {
      emailAccountId,
      rule: enabledOnly ? { enabled: true } : { isNot: null },
    },
    include: { items: true, rule: { include: { actions: true } } },
  });
}

export function findMatchingGroup(
  message: ParsedMessage,
  group: GroupsWithRules[number],
) {
  const matchingItem = findBestMatchingItem(message.headers, group.items);

  if (matchingItem?.exclude) {
    return {
      group,
      matchingItem: null,
      excluded: true,
      excludedItem: matchingItem,
    };
  }

  if (matchingItem)
    return { group, matchingItem, excluded: false, excludedItem: null };

  // No matches at all
  return {
    group: null,
    matchingItem: null,
    excluded: false,
    excludedItem: null,
  };
}

function matchesPattern<T extends Pick<GroupItem, "type" | "value">>(
  item: T,
  headers: { from: string; subject: string },
): boolean {
  const { from, subject } = headers;

  // from check
  if (item.type === GroupItemType.FROM && from) {
    const lowerValue = item.value.toLowerCase();
    const lowerFrom = from.toLowerCase();
    return lowerValue.includes(lowerFrom) || lowerFrom.includes(lowerValue);
  }

  // subject check
  if (item.type === GroupItemType.SUBJECT && subject) {
    const lowerSubject = subject.toLowerCase();
    const lowerItemValue = item.value.toLowerCase();

    const subjectWithoutNumbers = generalizeSubject(lowerSubject);
    const valueWithoutNumbers = generalizeSubject(lowerItemValue);

    return (
      lowerSubject.includes(lowerItemValue) ||
      subjectWithoutNumbers.includes(valueWithoutNumbers)
    );
  }

  return false;
}

// Keep this for backward compatibility
export function findMatchingGroupItem<
  T extends Pick<GroupItem, "type" | "value" | "exclude"> &
    Partial<Pick<GroupItem, "source" | "updatedAt">>,
>(headers: { from: string; subject: string }, groupItems: T[]) {
  const matchingItem = findBestMatchingItem(headers, groupItems);
  return matchingItem?.exclude ? null : matchingItem;
}

function findBestMatchingItem<
  T extends Pick<GroupItem, "type" | "value" | "exclude"> &
    Partial<Pick<GroupItem, "source" | "updatedAt">>,
>(headers: { from: string; subject: string }, groupItems: T[]) {
  const matches = groupItems.filter((item) => matchesPattern(item, headers));
  if (!matches.length) return;

  const userMatches = matches.filter(
    (item) => item.source === GroupItemSource.USER,
  );
  const candidates = userMatches.length ? userMatches : matches;

  return candidates.reduce((best, item) => {
    const bestUpdatedAt = best.updatedAt?.getTime();
    const itemUpdatedAt = item.updatedAt?.getTime();

    if (itemUpdatedAt !== undefined && bestUpdatedAt !== undefined) {
      if (itemUpdatedAt > bestUpdatedAt) return item;
      if (itemUpdatedAt < bestUpdatedAt) return best;
    }

    if (itemUpdatedAt !== undefined && bestUpdatedAt === undefined) return item;
    if (itemUpdatedAt === undefined && bestUpdatedAt !== undefined) return best;

    return item.exclude && !best.exclude ? item : best;
  });
}
