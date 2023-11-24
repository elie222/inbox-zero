import { env } from "@/env.mjs";

export function hasCronSecret(request: Request) {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${env.CRON_SECRET}`;
}
