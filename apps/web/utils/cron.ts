import { env } from "@/env";
import type { RequestWithLogger } from "@/utils/middleware";

export function hasCronSecret(request: RequestWithLogger) {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    logMissingCronSecret(request);
    return false;
  }

  const authHeader = request.headers.get("authorization");
  const valid = authHeader === `Bearer ${cronSecret}`;

  if (!valid)
    request.logger.error("Unauthorized cron request", {
      hasAuthorizationHeader: Boolean(authHeader),
    });

  return valid;
}

export async function hasPostCronSecret(request: RequestWithLogger) {
  const cronSecret = getCronSecret();
  if (!cronSecret) {
    logMissingCronSecret(request);
    return false;
  }

  // Clone the request before consuming the body
  const clonedRequest = request.clone();
  const body = await clonedRequest.json().catch(() => null);
  const valid = body?.CRON_SECRET === cronSecret;

  if (!valid)
    request.logger.error("Unauthorized cron request", {
      hasCronSecretInBody: Boolean(body?.CRON_SECRET),
    });

  return valid;
}

export function getCronSecretHeader() {
  const cronSecret = getCronSecret();
  return cronSecret
    ? new Headers({ authorization: `Bearer ${cronSecret}` })
    : new Headers();
}

function getCronSecret() {
  return process.env.CRON_SECRET ?? env.CRON_SECRET;
}

function logMissingCronSecret(request: RequestWithLogger) {
  const userAgent = request.headers.get("user-agent");
  const isVercelCron = userAgent?.startsWith("vercel-cron/") ?? false;

  request.logger.error("No cron secret set, unauthorized cron request", {
    isVercelCron,
    hint: isVercelCron
      ? "Set CRON_SECRET in Vercel project environment variables."
      : undefined,
  });
}
