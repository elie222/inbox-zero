import prisma from "@/utils/prisma";
import { extractEmailAddress } from "@/utils/email";
import {
  createAnchoredAddressRegex,
  isAddressLikeEmailPattern,
  splitEmailPatterns,
} from "@/utils/rule/email-from-pattern";
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

  if (item.type === GroupItemType.FROM && from) {
    return matchesFromItem(item.value, from);
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
    // Unknown legacy provenance may represent an explicit user instruction.
    (item) => item.source == null || item.source === GroupItemSource.USER,
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

// Address and domain patterns must match the sender address on a boundary, as
// static from conditions do. A substring match would let a learned
// `ann@acme.com` catch `joann@acme.com` or `ann@acme.com.evil.io`, and with it
// skip AI matching for every other rule. Other values, such as a display name,
// can still appear anywhere in the From header. A value can list several
// patterns, split the same way as static from conditions.
function matchesFromItem(value: string, fromHeader: string) {
  const lowerFrom = fromHeader.toLowerCase();
  const senderAddress = extractEmailAddress(fromHeader).toLowerCase();

  return splitEmailPatterns(value).some((part) => {
    // A pattern saved as a full "Name <address>" header matches by its address.
    const pattern = (
      (part.includes("<") && extractEmailAddress(part)) ||
      part
    ).toLowerCase();

    if (!isAddressLikeEmailPattern(pattern)) return lowerFrom.includes(pattern);

    return (
      !!senderAddress && createAnchoredAddressRegex(pattern).test(senderAddress)
    );
  });
}
