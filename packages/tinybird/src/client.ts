import { Tinybird } from "@chronark/zod-bird";

export const tb = new Tinybird({
  token: process.env.TINYBIRD_TOKEN!,
  baseUrl: process.env.TINYBIRD_BASE_URL,
});

export function isTinybirdEnabled() {
  return !!process.env.TINYBIRD_TOKEN;
}
