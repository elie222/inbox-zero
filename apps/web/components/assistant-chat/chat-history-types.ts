import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { GetChatsResponse } from "@/app/api/chats/route";

export type ChatHistoryEntry = GetChatsResponse["chats"][number];

export function getChatHistoryLabel(
  chat: Pick<ChatHistoryEntry, "name" | "createdAt">,
  i18n: I18n,
): string {
  if (chat.name != null) return chat.name;
  const date = new Date(chat.createdAt).toLocaleString(i18n.locale);
  return i18n._(msg`Chat from ${date}`);
}
