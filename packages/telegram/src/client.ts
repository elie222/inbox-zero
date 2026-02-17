const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

type TelegramClientRequest = {
  botToken: string;
  method: string;
  body?: unknown;
};

type TelegramApiResponse<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
};

export async function telegramClientRequest<T>({
  botToken,
  method,
  body,
}: TelegramClientRequest): Promise<T> {
  const normalizedMethod = method.startsWith("/") ? method.slice(1) : method;
  const url = `${TELEGRAM_API_BASE_URL}/bot${botToken}/${normalizedMethod}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = (await response.json()) as TelegramApiResponse<T>;

  if (!response.ok || data.ok !== true || data.result === undefined) {
    const description =
      typeof data.description === "string" ? data.description : "Unknown error";
    throw new Error(`Telegram API request failed: ${description}`);
  }

  return data.result;
}
