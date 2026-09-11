import { env } from "@/env";
import { secureCompare } from "@/utils/crypto-compare";
import { isValidInternalApiKey } from "@/utils/internal-api";
import type { RequestWithLogger } from "@/utils/middleware";

export function hasCronSecret(request: RequestWithLogger) {
  if (!env.CRON_SECRET) {
    request.logger.error("No cron secret set, unauthorized cron request");
    return false;
  }

  const valid = isValidCronSecret(request);

  if (!valid)
    request.logger.error("Unauthorized cron request:", {
      authHeader: request.headers.get("authorization"),
    });

  return valid;
}

/**
 * For routes reached both by cron and by an internal queue forward. The cron
 * secret is checked quietly because a queue request only carries the internal
 * API key, and logging that as unauthorized before the key is even checked
 * floods the error logs.
 */
export function isAuthorizedCronOrInternalRequest(request: RequestWithLogger) {
  if (isValidCronSecret(request)) return true;
  return isValidInternalApiKey(request.headers, request.logger);
}

export async function hasPostCronSecret(request: RequestWithLogger) {
  if (!env.CRON_SECRET) {
    request.logger.error("No cron secret set, unauthorized cron request");
    return false;
  }

  // Clone the request before consuming the body
  const clonedRequest = request.clone();
  const body = await clonedRequest.json();
  const valid = secureCompare(body.CRON_SECRET, env.CRON_SECRET);

  if (!valid) request.logger.error("Unauthorized cron request:", { body });

  return valid;
}

export function getCronSecretHeader() {
  return new Headers({ authorization: `Bearer ${env.CRON_SECRET}` });
}

function isValidCronSecret(request: RequestWithLogger) {
  if (!env.CRON_SECRET) return false;
  return secureCompare(
    request.headers.get("authorization"),
    `Bearer ${env.CRON_SECRET}`,
  );
}
