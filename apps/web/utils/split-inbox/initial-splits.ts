import type { MailSplit } from "@/utils/split-inbox/split-query";
import { MailSplitFilterKind } from "@/generated/prisma/enums";

const ALL_MAIL_SPLIT_NAME = "All";

export const INITIAL_MAIL_SPLITS = [
  { name: ALL_MAIL_SPLIT_NAME, matchAll: true, filters: { create: [] } },
  {
    name: "Unread",
    matchAll: true,
    filters: {
      create: [{ kind: MailSplitFilterKind.UNREAD, value: null, order: 0 }],
    },
  },
];

export function ensureAllMailSplit(
  splits: (MailSplit & {
    order: number;
    bundleInInbox: boolean;
    hideFromAll: boolean;
  })[],
) {
  if (splits.some((split) => split.filters.length === 0)) return splits;

  // Older accounts may have deleted All before the default tab was protected.
  return [
    {
      id: "all",
      name: ALL_MAIL_SPLIT_NAME,
      order: -1,
      matchAll: true,
      bundleInInbox: false,
      hideFromAll: false,
      filters: [],
    },
    ...splits,
  ];
}

// The app's own All tab, still under the name it was created with. A tab the
// user renamed keeps their name.
export function isDefaultAllMailSplit(
  split: Pick<MailSplit, "name" | "filters">,
) {
  return !split.filters.length && split.name === ALL_MAIL_SPLIT_NAME;
}
