import { betterAuthConfig } from "@/utils/auth";
import { toNextJsHandler } from "better-auth/next-js";
import { deduplicateOAuthCallback } from "@/utils/oauth/auth-callback-deduplication";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("auth/oauth-callback");
const handlers = toNextJsHandler(betterAuthConfig);

export const { POST, PUT, PATCH, DELETE } = handlers;

export const GET: typeof handlers.GET = async (...args) => {
  const [request] = args;

  return deduplicateOAuthCallback({
    request,
    handleRequest: () => handlers.GET(...args),
    logger,
  });
};
