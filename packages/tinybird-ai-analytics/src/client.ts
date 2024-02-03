import { Tinybird } from "@chronark/zod-bird";

if (!process.env.TINYBIRD_TOKEN) throw new Error("Missing TINYBIRD_TOKEN");

let tb: Tinybird;

export const getTinybird = () => {
  if (!process.env.TINYBIRD_TOKEN) return;

  if (!tb) {
    tb = new Tinybird({
      token: process.env.TINYBIRD_TOKEN,
      baseUrl: process.env.TINYBIRD_BASE_URL,
    });
  }

  return tb;
};
