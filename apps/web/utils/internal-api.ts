import { env } from "@/env";

export const INTERNAL_API_KEY_HEADER = "x-api-key";

export const isValidInternalApiKey = (headers: Headers): boolean => {
  if (!env.INTERNAL_API_KEY) return false;
  const apiKey = headers.get(INTERNAL_API_KEY_HEADER);
  return apiKey === env.INTERNAL_API_KEY;
};
