export type SenderMessageCounts = {
  inbox: number;
  unread: number;
  read: number;
  total: number;
};

export const emptySenderMessageCounts: SenderMessageCounts = {
  inbox: 0,
  unread: 0,
  read: 0,
  total: 0,
};

export type CategoryStats = SenderMessageCounts & { senders: number };

export function sumCategoryStats(
  senderCounts: SenderMessageCounts[],
): CategoryStats {
  const sum = { ...emptySenderMessageCounts, senders: senderCounts.length };
  for (const counts of senderCounts) {
    sum.inbox += counts.inbox;
    sum.unread += counts.unread;
    sum.read += counts.read;
    sum.total += counts.total;
  }
  return sum;
}

/** Share of a category's stored mail that was read; undefined with no mail. */
export function getReadRate({ read, total }: SenderMessageCounts) {
  return total > 0 ? read / total : undefined;
}

/**
 * Orders categories by how rarely their mail is read, lowest first, and picks
 * the one lead category: the lowest read rate among categories with senders.
 * Read rate counts all stored mail, so archiving never reshuffles the rows.
 */
export function orderByReadRate<
  T extends { name: string; stats: CategoryStats },
>(categories: T[]) {
  const ordered = [...categories].sort((a, b) => {
    const rateA = getReadRate(a.stats);
    const rateB = getReadRate(b.stats);
    if (rateA === undefined && rateB === undefined) {
      return a.name.localeCompare(b.name);
    }
    if (rateA === undefined) return 1;
    if (rateB === undefined) return -1;
    return rateA - rateB || a.name.localeCompare(b.name);
  });
  const lead = ordered.find(
    ({ stats }) => stats.senders > 0 && getReadRate(stats) !== undefined,
  );
  return { ordered, leadName: lead?.name };
}
