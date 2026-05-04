import type { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SafeError } from "@/utils/error";
import {
  validateAccountApiKey,
  validateApiKeyAndGetEmailProvider,
  type AccountApiKeyPrincipal,
  type StatsApiKeyPrincipal,
} from "@/utils/api-auth";
import type { ApiKeyScopeValue } from "@/utils/api-key-scopes";
import type { EmailProvider } from "@/utils/email/types";
import {
  withError,
  type NextHandler,
  type RequestWithLogger,
} from "@/utils/middleware";
import { setAuditContext } from "@/utils/audit/context";
import { env } from "@/env";

interface RequestWithAccountApiKey extends RequestWithLogger {
  apiAuth: AccountApiKeyPrincipal & { authType: "account-scoped" };
}

interface RequestWithStatsApiKey extends RequestWithLogger {
  apiAuth: StatsApiKeyPrincipal;
  emailProvider: EmailProvider;
}

export function withAccountApiKey(
  scope: string,
  requiredScopes: ApiKeyScopeValue[],
  handler: NextHandler<RequestWithAccountApiKey>,
): NextHandler {
  return withError(scope, async (request, context) => {
    assertExternalApiEnabled();

    let logger = request.logger.with(
      getApiBaseLogFields(request, requiredScopes),
    );
    const startedAt = Date.now();
    request.logger = logger;

    try {
      const principal = await validateAccountApiKey(request, requiredScopes);
      const apiAuth = {
        ...principal,
        authType: "account-scoped" as const,
      };

      setAuditContext({
        actorType: "api_key",
        apiKeyId: apiAuth.apiKeyId,
        emailAccountId: apiAuth.emailAccountId,
        userId: apiAuth.userId,
      });

      logger = logger.with(getApiAuthLogFields(apiAuth));
      request.logger = logger;

      const apiRequest = request as RequestWithAccountApiKey;
      apiRequest.apiAuth = apiAuth;
      apiRequest.logger = logger;

      const response = await handler(apiRequest, context);
      logApiRequestCompleted({ logger, response, startedAt });

      return response;
    } catch (error) {
      logApiRequestFailed({ logger, error, startedAt });
      throw error;
    }
  });
}

export function withStatsApiKey(
  scope: string,
  handler: NextHandler<RequestWithStatsApiKey>,
): NextHandler {
  return withError(scope, async (request, context) => {
    assertExternalApiEnabled();

    let logger = request.logger.with(
      getApiBaseLogFields(request, ["STATS_READ"]),
    );
    const startedAt = Date.now();
    request.logger = logger;

    try {
      const { emailProvider, ...principal } =
        await validateApiKeyAndGetEmailProvider(request);

      setAuditContext({
        actorType: "api_key",
        apiKeyId: principal.apiKeyId,
        emailAccountId: principal.emailAccountId,
        userId: principal.userId,
      });

      logger = logger.with(getApiAuthLogFields(principal));
      request.logger = logger;

      const apiRequest = request as RequestWithStatsApiKey;
      apiRequest.apiAuth = principal;
      apiRequest.emailProvider = emailProvider;
      apiRequest.logger = logger;

      const response = await handler(apiRequest, context);
      logApiRequestCompleted({ logger, response, startedAt });

      return response;
    } catch (error) {
      logApiRequestFailed({ logger, error, startedAt });
      throw error;
    }
  });
}

function getApiBaseLogFields(
  request: RequestWithLogger,
  requiredScopes: ApiKeyScopeValue[],
) {
  return {
    apiSurface: "external",
    apiRequiredScopes: requiredScopes,
    method: request.method,
    url: getApiLogUrl(request.url),
    pathname: new URL(request.url).pathname,
  };
}

function getApiAuthLogFields(
  principal:
    | (AccountApiKeyPrincipal & { authType: "account-scoped" })
    | StatsApiKeyPrincipal,
) {
  return {
    accountId: principal.accountId,
    apiAuthType: principal.authType,
    apiGrantedScopes: principal.scopes,
    apiKeyId: principal.apiKeyId,
    apiKeyScopeCount: principal.scopes.length,
    emailAccountId: principal.emailAccountId,
    provider: principal.provider,
    userId: principal.userId,
  };
}

function logApiRequestCompleted({
  logger,
  response,
  startedAt,
}: {
  logger: RequestWithLogger["logger"];
  response: NextResponse | Response;
  startedAt: number;
}) {
  logger.info("External API request completed", {
    durationMs: Date.now() - startedAt,
    statusCode: response.status,
  });
}

function logApiRequestFailed({
  logger,
  error,
  startedAt,
}: {
  logger: RequestWithLogger["logger"];
  error: unknown;
  startedAt: number;
}) {
  logger.warn("External API request failed", {
    durationMs: Date.now() - startedAt,
    ...getApiFailureLogFields(error),
  });
}

function getApiFailureLogFields(error: unknown) {
  if (error instanceof SafeError) {
    return {
      errorMessage: error.safeMessage ?? error.message,
      errorName: error.name,
      isKnownError: true,
    };
  }

  if (error instanceof ZodError) {
    return {
      errorName: error.name,
      isKnownError: true,
      issueCount: error.issues.length,
    };
  }

  if (error instanceof Error) {
    return {
      errorMessage: error.message,
      errorName: error.name,
      isKnownError: false,
    };
  }

  return {
    errorName: "UnknownError",
    isKnownError: false,
  };
}

function getApiLogUrl(url: string) {
  const parsedUrl = new URL(url);

  return `${parsedUrl.origin}${parsedUrl.pathname}`;
}

function assertExternalApiEnabled() {
  if (!env.NEXT_PUBLIC_EXTERNAL_API_ENABLED) {
    throw new SafeError("External API is not enabled");
  }
}
