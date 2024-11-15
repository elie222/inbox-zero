import { Client } from "@upstash/qstash";
import { env } from "@/env";

export function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}
