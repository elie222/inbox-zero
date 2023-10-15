import { Tinybird } from "@chronark/zod-bird";

if (!process.env.TINYBIRD_TOKEN) throw new Error("Missing TINYBIRD_TOKEN");

export const tb = new Tinybird({
  token: process.env.TINYBIRD_TOKEN,
  baseUrl: process.env.TINYBIRD_BASE_URL,
});
