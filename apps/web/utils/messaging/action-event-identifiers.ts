import type { ActionEvent } from "chat";

export function getSlackTeamId(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;

  const payload = raw as {
    team?: { id?: unknown };
    team_id?: unknown;
  };

  return (
    normalizeIdentifier(payload.team?.id) ??
    normalizeIdentifier(payload.team_id)
  );
}

export function getTelegramChatId(event: ActionEvent): string | null {
  const rawChatId =
    (event.raw as { message?: { chat?: { id?: string | number } } })?.message
      ?.chat?.id ??
    (
      event.raw as {
        callback_query?: { message?: { chat?: { id?: string | number } } };
      }
    )?.callback_query?.message?.chat?.id;
  if (rawChatId !== undefined && rawChatId !== null) {
    return String(rawChatId);
  }

  try {
    const decoded = event.adapter.decodeThreadId(event.threadId) as {
      chatId?: string | number;
    } | null;
    if (decoded?.chatId !== undefined && decoded.chatId !== null) {
      return String(decoded.chatId);
    }
  } catch {
    // Fall back to providerUserId-only authorization below.
  }

  return null;
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;

  return value.trim() || null;
}
