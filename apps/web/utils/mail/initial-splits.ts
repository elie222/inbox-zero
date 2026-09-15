import { MailSplitKind } from "@/generated/prisma/enums";

export const INITIAL_MAIL_SPLITS = [
  {
    name: "All",
    kind: MailSplitKind.INBOX,
    values: [] as string[],
  },
  {
    name: "Unread",
    kind: MailSplitKind.UNREAD,
    values: [] as string[],
  },
] as const;
