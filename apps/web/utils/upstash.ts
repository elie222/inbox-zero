import { Client } from "@upstash/qstash";
import { env } from "@/env";

export function getQstashClient() {
  if (!env.QSTASH_TOKEN) throw new Error("QSTASH_TOKEN is not set");
  return new Client({ token: env.QSTASH_TOKEN });
}
