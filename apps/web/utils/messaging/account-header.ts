import { CardText, type CardChild } from "chat";
import { escapeTelegramMarkdown } from "@/utils/messaging/providers/telegram/format";

const ACCOUNT_HEADER_PREFIX = "📬 Account:";

export function formatAccountHeader(email: string): string {
  return `${ACCOUNT_HEADER_PREFIX} ${email}`;
}

export function telegramAccountHeaderCardChild(email: string): CardChild {
  return CardText(`${ACCOUNT_HEADER_PREFIX} ${escapeTelegramMarkdown(email)}`);
}
