import { telegramClientRequest } from "./client";

export type TelegramBot = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type SetTelegramWebhookParams = {
  botToken: string;
  webhookUrl: string;
  secretToken: string;
};

export async function getTelegramBot({
  botToken,
}: {
  botToken: string;
}): Promise<TelegramBot> {
  return telegramClientRequest<TelegramBot>({
    botToken,
    method: "getMe",
  });
}

export async function setTelegramWebhook({
  botToken,
  webhookUrl,
  secretToken,
}: SetTelegramWebhookParams): Promise<void> {
  await telegramClientRequest<boolean>({
    botToken,
    method: "setWebhook",
    body: {
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: ["message"],
    },
  });
}
