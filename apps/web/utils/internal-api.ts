import { env } from "@/env";

export const INTERNAL_API_KEY_HEADER = "x-internal-api-key";

export function isValidInternalApiKey(apiKey: string | null) {
  return !!apiKey && apiKey === env.INTERNAL_API_KEY;
}
