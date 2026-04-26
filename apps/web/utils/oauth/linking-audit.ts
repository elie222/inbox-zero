import { createHmac } from "node:crypto";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

type OAuthLinkingProvider = "google" | "microsoft";

interface OAuthLinkingAuditLoggerParams {
  actorUserId: string | null;
  logger: Logger;
  provider: OAuthLinkingProvider;
  stateNonce: string;
  targetUserId: string;
}

export function createOAuthLinkingAuditLogger({
  actorUserId,
  logger,
  provider,
  stateNonce,
  targetUserId,
}: OAuthLinkingAuditLoggerParams) {
  return logger.with({
    actorMatchesTarget: actorUserId === targetUserId,
    actorUserId,
    auditType: "oauth_linking",
    hasActorSession: !!actorUserId,
    provider,
    stateNonce,
    targetUserId,
  });
}

export function logOAuthLinkingCallbackValidation(
  params: OAuthLinkingAuditLoggerParams,
) {
  const logger = createOAuthLinkingAuditLogger(params);

  logger.info("OAuth linking callback validated");

  if (!params.actorUserId) {
    logger.warn("OAuth linking callback missing authenticated actor");
  } else if (params.actorUserId !== params.targetUserId) {
    logger.warn("OAuth linking callback actor mismatch");
  }

  return logger;
}

export function hashOAuthAuditIdentifier(value: string) {
  return createHmac("sha256", getOAuthAuditSecret())
    .update(value.trim())
    .digest("hex");
}

function getOAuthAuditSecret() {
  const secret = env.AUTH_SECRET || env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Either AUTH_SECRET or NEXTAUTH_SECRET environment variable must be defined",
    );
  }

  return secret;
}
