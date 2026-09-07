import { MailSplitKind } from "@/generated/prisma/enums";

export const BUILT_IN_SPLITS = [
  {
    id: "all",
    name: "All",
    kind: MailSplitKind.INBOX,
    values: [] as string[],
  },
  {
    id: "unread",
    name: "Unread",
    kind: MailSplitKind.UNREAD,
    values: [] as string[],
  },
] as const;
