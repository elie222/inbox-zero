import type { ParsedMessage } from "@/utils/types";
import type {
  EmailAccount,
  ExecutedAction,
  ExecutedRule,
} from "@/generated/prisma/client";

export type EmailForAction = Pick<
  ParsedMessage,
  | "threadId"
  | "id"
  | "headers"
  | "textPlain"
  | "textHtml"
  | "snippet"
  | "attachments"
  | "internalDate"
  | "rawRecipients"
>;

export type ActionItem = {
  id: ExecutedAction["id"];
  type: ExecutedAction["type"];
  messagingChannelId?: ExecutedAction["messagingChannelId"];
  label?: ExecutedAction["label"];
  labelId?: ExecutedAction["labelId"];
  subject?: ExecutedAction["subject"];
  content?: ExecutedAction["content"];
  to?: ExecutedAction["to"];
  cc?: ExecutedAction["cc"];
  bcc?: ExecutedAction["bcc"];
  url?: ExecutedAction["url"];
  folderName?: ExecutedAction["folderName"];
  folderId?: ExecutedAction["folderId"];
  delayInMinutes?: number | null;
  staticAttachments?: ExecutedAction["staticAttachments"];
  selectedAttachments?: ExecutedAction["selectedAttachments"];
};

export type ActionExecutionEmailAccount = Pick<
  EmailAccount,
  "email" | "id" | "userId"
>;

export type ExecutedRuleForAction = ExecutedRule & {
  actionItems?: Pick<ActionItem, "type">[];
};
