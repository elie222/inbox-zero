import type { ParsedMessage } from "@/utils/types";
import type { ExecutedAction } from "@prisma/client";

export type EmailForAction = Pick<
  ParsedMessage,
  | "threadId"
  | "id"
  | "headers"
  | "textPlain"
  | "textHtml"
  | "attachments"
  | "internalDate"
>;

export type ActionItem = {
  id: ExecutedAction["id"];
  type: ExecutedAction["type"];
  label?: ExecutedAction["label"];
  subject?: ExecutedAction["subject"];
  content?: ExecutedAction["content"];
  to?: ExecutedAction["to"];
  cc?: ExecutedAction["cc"];
  bcc?: ExecutedAction["bcc"];
  url?: ExecutedAction["url"];
  delayInMinutes?: number | null;
};
