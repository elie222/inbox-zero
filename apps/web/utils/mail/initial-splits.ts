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
