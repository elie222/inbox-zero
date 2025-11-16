import { ZodError } from "zod";
import { type NextRequest, NextResponse, after } from "next/server";
import { randomUUID } from "node:crypto";
import { captureException, checkCommonErrors, SafeError } from "@/utils/error";
import { env } from "@/env";
import { logErrorToPosthog } from "@/utils/error.server";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { auth } from "@/utils/auth";
import { getEmailAccount } from "@/utils/redis/account-validation";
import { getCallerEmailAccount } from "@/utils/organizations/access";
import {
  EMAIL_ACCOUNT_HEADER,
  NO_REFRESH_TOKEN_ERROR_CODE,
} from "@/utils/config";
import prisma from "@/utils/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

const logger = createScopedLogger("middleware");

export type NextHandler<T extends NextRequest = NextRequest> = (
  req: T,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export interface RequestWithLogger extends NextRequest {
  logger: Logger;
}

// Extended request type with validated account info
export interface RequestWithAuth extends RequestWithLogger {
  auth: { userId: string };
}

export interface RequestWithEmailAccount extends RequestWithLogger {
  auth: {
    userId: string;
    emailAccountId: string;
    email: string;
  };
}
export interface RequestWithEmailProvider extends RequestWithEmailAccount {
  emailProvider: EmailProvider;
}

export interface MiddlewareOptions {
  allowOrgAdmins?: boolean;
}

// Higher-order middleware factory that handles common error logic
function withMiddleware<T extends NextRequest>(
  handler: NextHandler<T>,
  middleware?: (
    req: NextRequest,
    options?: MiddlewareOptions,
  ) => Promise<T | Response>,
  options?: MiddlewareOptions,
  scope?: string,
): NextHandler {
  return async (req, context) => {
    const requestId = req.headers.get("x-request-id") || randomUUID();
    const baseLogger = createScopedLogger(scope || "api").with({
      requestId,
      url: req.url,
    });

    const reqWithLogger = req as NextRequest & { logger?: Logger };
    reqWithLogger.logger = baseLogger;

    try {
      // Apply middleware if provided
      let enhancedReq = reqWithLogger;
      if (middleware) {
        const middlewareResult = await middleware(reqWithLogger, options);

        // If middleware returned a Response, return it directly
        if (middlewareResult instanceof Response) {
          flushLogger(reqWithLogger);
          return middlewareResult;
        }

        // Otherwise, continue with the enhanced request
        enhancedReq = middlewareResult;
      }

      // Execute the handler with the (potentially) enhanced request
      const response = await handler(enhancedReq as T, context);

      flushLogger(enhancedReq);

      return response;
    } catch (error) {
      flushLogger(reqWithLogger);

      // redirects work by throwing an error. allow these
      if (error instanceof Error && error.message === "NEXT_REDIRECT") {
        throw error;
      }

      if (error instanceof SafeError) {
        if (error.message === "No refresh token") {
          return NextResponse.json(
            {
              error: "Authorization required. Please grant permissions.",
              errorCode: NO_REFRESH_TOKEN_ERROR_CODE,
              isKnownError: true,
            },
            { status: 401 },
          );
        }
      }

      const reqLogger = getLogger(reqWithLogger);

      if (error instanceof ZodError) {
        if (env.LOG_ZOD_ERRORS) {
          reqLogger.error("Zod validation error", { error });
        }
        return NextResponse.json(
          { error: { issues: error.issues }, isKnownError: true },
          { status: 400 },
        );
      }

      const apiError = checkCommonErrors(error, req.url);
      if (apiError) {
        await logErrorToPosthog("api", req.url, apiError.type, "unknown"); // TODO: add emailAccountId

        return NextResponse.json(
          { error: apiError.message, isKnownError: true },
          { status: apiError.code },
        );
      }

      if (isErrorWithConfigAndHeaders(error)) {
        error.config.headers = undefined;
      }

      if (error instanceof SafeError) {
        return NextResponse.json(
          { error: error.safeMessage, isKnownError: true },
          { status: 400 },
        );
      }

      // Quick fix: log full error in development. TODO: handle properly
      if (env.NODE_ENV === "development") {
        // biome-ignore lint/suspicious/noConsole: helpful for debugging
        console.error(error);
      }

      reqLogger.error("Unhandled error", {
        error: error instanceof Error ? error.message : error,
      });
      captureException(error, { extra: { url: req.url } });

      return NextResponse.json(
        { error: "An unexpected error occurred" },
        { status: 500 },
      );
    }
  };
}

async function authMiddleware(
  req: NextRequest,
): Promise<RequestWithAuth | Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: "Unauthorized", isKnownError: true },
      { status: 401 },
    );
  }

  const authReq = req.clone() as RequestWithAuth;
  authReq.auth = { userId: session.user.id };

  const baseLogger = getLogger(req);
  authReq.logger = baseLogger.with({ userId: session.user.id });

  return authReq;
}

async function emailAccountMiddleware(
  req: NextRequest,
  options?: MiddlewareOptions,
): Promise<RequestWithEmailAccount | Response> {
  const authReq = await authMiddleware(req);
  if (authReq instanceof Response) return authReq;

  const userId = authReq.auth.userId;

  const emailAccountId = req.headers.get(EMAIL_ACCOUNT_HEADER);

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account ID is required", isKnownError: true },
      { status: 403 },
    );
  }

  // If account ID is provided, validate and get the email account ID
  const email = await getEmailAccount({ userId, emailAccountId });

  const emailAccountLogger = authReq.logger.with({ emailAccountId, email });

  if (!email && options?.allowOrgAdmins) {
    // Check if user is admin or owner and is in the same org as the target email account
    const callerEmailAccount = await getCallerEmailAccount(
      userId,
      emailAccountId,
    );

    if (!callerEmailAccount) {
      emailAccountLogger.error("Org admin access denied");
      return NextResponse.json(
        { error: "Insufficient permissions", isKnownError: true },
        { status: 403 },
      );
    }

    const targetEmailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId },
      select: { email: true },
    });

    if (targetEmailAccount) {
      const emailAccountReq = req.clone() as RequestWithEmailAccount;
      emailAccountReq.auth = {
        userId,
        emailAccountId,
        email: targetEmailAccount.email,
      };
      emailAccountReq.logger = emailAccountLogger.with({
        isOrgAdmin: true,
        email: targetEmailAccount.email,
      });
      return emailAccountReq;
    }
  }

  if (!email) {
    emailAccountLogger.error("Invalid email account ID");
    return NextResponse.json(
      { error: "Invalid account ID", isKnownError: true },
      { status: 403 },
    );
  }

  // Create a new request with email account info
  const emailAccountReq = req.clone() as RequestWithEmailAccount;
  emailAccountReq.auth = { userId, emailAccountId, email };
  emailAccountReq.logger = emailAccountLogger;

  return emailAccountReq;
}

async function emailProviderMiddleware(
  req: NextRequest,
): Promise<RequestWithEmailProvider | Response> {
  // First run email account middleware
  const emailAccountReq = await emailAccountMiddleware(req);
  if (emailAccountReq instanceof Response) return emailAccountReq;

  const { userId, emailAccountId } = emailAccountReq.auth;

  try {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: {
        id: emailAccountId,
        userId, // ensure it belongs to the user
      },
      include: {
        account: {
          select: {
            provider: true,
          },
        },
      },
    });

    if (!emailAccount) {
      return NextResponse.json(
        { error: "Email account not found", isKnownError: true },
        { status: 404 },
      );
    }

    const provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account.provider,
      logger: emailAccountReq.logger,
    });

    const providerReq = emailAccountReq.clone() as RequestWithEmailProvider;
    providerReq.auth = emailAccountReq.auth;
    providerReq.emailProvider = provider;
    providerReq.logger = emailAccountReq.logger;

    return providerReq;
  } catch (error) {
    emailAccountReq.logger.error("Failed to create email provider", {
      error,
      emailAccountId,
      userId,
    });
    return NextResponse.json(
      { error: "Failed to initialize email provider" },
      { status: 500 },
    );
  }
}

// Public middlewares that build on the common infrastructure

// withError overloads
export function withError(
  scope: string,
  handler: NextHandler<RequestWithLogger>,
  options?: MiddlewareOptions,
): NextHandler;
export function withError(
  handler: NextHandler,
  options?: MiddlewareOptions,
): NextHandler;
export function withError(
  scopeOrHandler: string | NextHandler | NextHandler<RequestWithLogger>,
  handlerOrOptions?: NextHandler<RequestWithLogger> | MiddlewareOptions,
  options?: MiddlewareOptions,
): NextHandler {
  if (typeof scopeOrHandler === "string") {
    return withMiddleware(
      handlerOrOptions as NextHandler<RequestWithLogger>,
      undefined,
      options,
      scopeOrHandler,
    );
  }
  return withMiddleware(
    scopeOrHandler as NextHandler,
    undefined,
    handlerOrOptions as MiddlewareOptions,
  );
}

// withAuth overloads
export function withAuth(
  scope: string,
  handler: NextHandler<RequestWithAuth>,
): NextHandler;
export function withAuth(handler: NextHandler<RequestWithAuth>): NextHandler;
export function withAuth(
  scopeOrHandler: string | NextHandler<RequestWithAuth>,
  handler?: NextHandler<RequestWithAuth>,
): NextHandler {
  if (typeof scopeOrHandler === "string") {
    return withMiddleware(handler!, authMiddleware, undefined, scopeOrHandler);
  }
  return withMiddleware(scopeOrHandler, authMiddleware);
}

// withEmailAccount overloads
export function withEmailAccount(
  scope: string,
  handler: NextHandler<RequestWithEmailAccount>,
  options?: MiddlewareOptions,
): NextHandler;
export function withEmailAccount(
  handler: NextHandler<RequestWithEmailAccount>,
  options?: MiddlewareOptions,
): NextHandler;
export function withEmailAccount(
  scopeOrHandler: string | NextHandler<RequestWithEmailAccount>,
  handlerOrOptions?: NextHandler<RequestWithEmailAccount> | MiddlewareOptions,
  options?: MiddlewareOptions,
): NextHandler {
  if (typeof scopeOrHandler === "string") {
    return withMiddleware(
      handlerOrOptions as NextHandler<RequestWithEmailAccount>,
      emailAccountMiddleware,
      options,
      scopeOrHandler,
    );
  }
  return withMiddleware(
    scopeOrHandler,
    emailAccountMiddleware,
    handlerOrOptions as MiddlewareOptions,
  );
}

// withEmailProvider overloads
export function withEmailProvider(
  scope: string,
  handler: NextHandler<RequestWithEmailProvider>,
): NextHandler;
export function withEmailProvider(
  handler: NextHandler<RequestWithEmailProvider>,
): NextHandler;
export function withEmailProvider(
  scopeOrHandler: string | NextHandler<RequestWithEmailProvider>,
  handler?: NextHandler<RequestWithEmailProvider>,
): NextHandler {
  if (typeof scopeOrHandler === "string") {
    return withMiddleware(
      handler!,
      emailProviderMiddleware,
      undefined,
      scopeOrHandler,
    );
  }
  return withMiddleware(scopeOrHandler, emailProviderMiddleware);
}

function isErrorWithConfigAndHeaders(
  error: unknown,
): error is { config: { headers: unknown } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "config" in error &&
    "headers" in (error as { config: Record<string, unknown> }).config
  );
}

function getLogger(req: NextRequest): Logger {
  const reqWithLogger = req as RequestWithLogger;
  return reqWithLogger.logger || logger;
}

function flushLogger(req: NextRequest) {
  const reqWithLogger = req as RequestWithLogger;
  if (reqWithLogger.logger) {
    const loggerToFlush = reqWithLogger.logger;
    after(async () => {
      await loggerToFlush.flush().catch((error) => {
        captureException(error, { extra: { url: req.url } });
      });
    });
  }
}
