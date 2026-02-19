import { telegramClientRequest } from "./client";

export type SendTelegramTextMessageParams = {
  botToken: string;
  chatId: string;
  text: string;
};

type SendTelegramTextMessageResponse = {
  message_id: number;
};

export async function sendTelegramTextMessage({
  botToken,
  chatId,
  text,
}: SendTelegramTextMessageParams): Promise<SendTelegramTextMessageResponse> {
  return telegramClientRequest<SendTelegramTextMessageResponse>({
    botToken,
    method: "sendMessage",
    body: {
      chat_id: chatId,
      text,
    },
  });
}
