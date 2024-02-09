import { env } from "@/env.mjs";

export function hasCronSecret(request: Request) {
  const authHeader = request.headers.get("authorization");
  const valid = authHeader === `Bearer ${env.CRON_SECRET}`;

  if (!valid) console.error("Unauthorized cron request:", authHeader);

  return valid;
}

export async function hasPostCronSecret(request: Request) {
  const body = await request.json();
  const valid = body.CRON_SECRET === env.CRON_SECRET;

  if (!valid) console.error("Unauthorized cron request:", body.CRON_SECRET);

  return valid;
}
