type TelegramBotApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export async function callTelegramBotApi<T>({
  botToken,
  apiMethod,
  body,
  requestMethod,
}: {
  botToken: string;
  apiMethod: string;
  body?: BodyInit;
  requestMethod?: "GET" | "POST";
}): Promise<T> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/${apiMethod}`,
    {
      method: requestMethod ?? "POST",
      ...(body ? { body } : {}),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(
      `Telegram ${apiMethod} request failed (${response.status})`,
    );
  }

  const payload = (await response.json()) as TelegramBotApiResponse<T>;
  if (!payload.ok) {
    throw new Error(
      payload.description || `Telegram ${apiMethod} returned a failed response`,
    );
  }

  if (!("result" in payload)) {
    throw new Error(`Telegram ${apiMethod} returned no result payload`);
  }

  return payload.result as T;
}
