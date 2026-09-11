import type { MailSplit } from "@/utils/mail/split-query";
import { MailSplitFilterKind } from "@/generated/prisma/enums";

export const INITIAL_MAIL_SPLITS = [
  { name: "All", matchAll: true, filters: { create: [] } },
  {
    name: "Unread",
    matchAll: true,
    filters: {
      create: [{ kind: MailSplitFilterKind.UNREAD, value: null, order: 0 }],
    },
  },
];

export function ensureAllMailSplit(splits: (MailSplit & { order: number })[]) {
  if (splits.some((split) => split.filters.length === 0)) return splits;

  // Older accounts may have deleted All before the default tab was protected.
  return [
    { id: "all", name: "All", order: -1, matchAll: true, filters: [] },
    ...splits,
  ];
}
