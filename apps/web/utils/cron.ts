import { env } from "@/env.mjs";

export function hasCronSecret(request: Request) {
  const authHeader = request.headers.get("authorization");
  const valid = authHeader === `Bearer ${env.CRON_SECRET}`;

  console.log("Cron authHeader:", authHeader);
  console.log("Cron secret:", env.CRON_SECRET);
  console.log("Valid:", valid);

  return valid;
}
