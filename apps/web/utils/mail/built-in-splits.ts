import { MailSplitKind } from "@/generated/prisma/enums";

export const BUILT_IN_SPLITS = [
  { id: "all", name: "All", kind: MailSplitKind.INBOX, value: null },
  { id: "unread", name: "Unread", kind: MailSplitKind.UNREAD, value: null },
] as const;
