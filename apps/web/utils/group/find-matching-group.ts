import prisma from "@/utils/prisma";
import { generalizeSubject } from "@/utils/string";
import type { ParsedMessage } from "@/utils/types";
import { type GroupItem, GroupItemType } from "@prisma/client";

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
  // First check for exclude patterns
  const excludeMatch = findExclusionMatch(message.headers, group.items);
  if (excludeMatch) {
    // If any exclusion pattern matches, this rule is completely excluded
    return { group: null, matchingItem: null, excluded: true };
  }

  // If no exclusion patterns matched, check for inclusion patterns
  const matchingItem = findInclusionMatch(message.headers, group.items);
  if (matchingItem) return { group, matchingItem, excluded: false };

  // No matches at all
  return { group: null, matchingItem: null, excluded: false };
}

function matchesPattern<T extends Pick<GroupItem, "type" | "value">>(
  item: T,
  headers: { from: string; subject: string },
): boolean {
  const { from, subject } = headers;

  // from check
  if (item.type === GroupItemType.FROM && from) {
    return item.value.includes(from) || from.includes(item.value);
  }

  // subject check
  if (item.type === GroupItemType.SUBJECT && subject) {
    const subjectWithoutNumbers = generalizeSubject(subject);
    const valueWithoutNumbers = generalizeSubject(item.value);

    return (
      subject.includes(item.value) ||
      subjectWithoutNumbers.includes(valueWithoutNumbers)
    );
  }

  return false;
}

function findExclusionMatch<
  T extends Pick<GroupItem, "type" | "value" | "exclude">,
>(headers: { from: string; subject: string }, groupItems: T[]) {
  return groupItems.some(
    (item) => item.exclude && matchesPattern(item, headers),
  );
}

function findInclusionMatch<
  T extends Pick<GroupItem, "type" | "value" | "exclude">,
>(headers: { from: string; subject: string }, groupItems: T[]) {
  return groupItems.find(
    (item) => !item.exclude && matchesPattern(item, headers),
  );
}

// Keep this for backward compatibility
export function findMatchingGroupItem<
  T extends Pick<GroupItem, "type" | "value" | "exclude">,
>(headers: { from: string; subject: string }, groupItems: T[]) {
  const hasExclusion = findExclusionMatch(headers, groupItems);
  if (hasExclusion) return null;

  return findInclusionMatch(headers, groupItems);
}
