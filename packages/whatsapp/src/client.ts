const WHATSAPP_API_BASE_URL = "https://graph.facebook.com/v22.0";

type WhatsAppClientRequest = {
  accessToken: string;
  path: string;
  method?: "GET" | "POST";
  body?: unknown;
};

export async function whatsappClientRequest<T>({
  accessToken,
  path,
  method = "POST",
  body,
}: WhatsAppClientRequest): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = `${WHATSAPP_API_BASE_URL}/${normalizedPath}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMessage = getErrorMessage(data);
    throw new Error(`WhatsApp API request failed: ${errorMessage}`);
  }

  return data as T;
}

function getErrorMessage(data: unknown): string {
  if (!data || typeof data !== "object") return "Unknown error";

  const error = "error" in data ? data.error : undefined;
  if (!error || typeof error !== "object") return "Unknown error";

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : undefined;

  return message ?? "Unknown error";
}
