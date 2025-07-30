import { ZodError } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { captureException, checkCommonErrors, SafeError } from "@/utils/error";
import { env } from "@/env";
import { logErrorToPosthog } from "@/utils/error.server";
import { createScopedLogger } from "@/utils/logger";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getEmailAccount } from "@/utils/redis/account-validation";
import {
  EMAIL_ACCOUNT_HEADER,
  NO_REFRESH_TOKEN_ERROR_CODE,
} from "@/utils/config";
import prisma from "@/utils/prisma";
import {
  createEmailProvider,
  type EmailProvider,
} from "@/utils/email/provider";

const logger = createScopedLogger("middleware");

export type NextHandler<T extends NextRequest = NextRequest> = (
  req: T,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

// Extended request type with validated account info
export interface RequestWithAuth extends NextRequest {
  auth: {
    userId: string;
  };
}

export interface RequestWithEmailAccount extends NextRequest {
  auth: {
    userId: string;
    emailAccountId: string;
    email: string;
  };
}
export interface RequestWithEmailProvider extends RequestWithEmailAccount {
  emailProvider: EmailProvider;
}

// Higher-order middleware factory that handles common error logic
function withMiddleware<T extends NextRequest>(
  handler: NextHandler<T>,
  middleware?: (req: NextRequest) => Promise<T | Response>,
): NextHandler {
  return async (req, context) => {
    try {
      // Apply middleware if provided
      let enhancedReq = req;
      if (middleware) {
        const middlewareResult = await middleware(req);

        // If middleware returned a Response, return it directly
        if (middlewareResult instanceof Response) {
          return middlewareResult;
        }

        // Otherwise, continue with the enhanced request
        enhancedReq = middlewareResult;
      }

      // Execute the handler with the (potentially) enhanced request
      return await handler(enhancedReq as T, context);
    } catch (error) {
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

      if (error instanceof ZodError) {
        if (env.LOG_ZOD_ERRORS) {
          logger.error("Error for url", { error, url: req.url });
        }
        return NextResponse.json(
          { error: { issues: error.issues }, isKnownError: true },
          { status: 400 },
        );
      }

      const apiError = checkCommonErrors(error, req.url);
      if (apiError) {
        await logErrorToPosthog("api", req.url, apiError.type);

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

      logger.error("Unhandled error", {
        error: error instanceof Error ? error.message : error,
        url: req.url,
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

  // Create a new request with auth info
  const authReq = req.clone() as RequestWithAuth;
  authReq.auth = { userId: session.user.id };

  return authReq;
}

async function emailAccountMiddleware(
  req: NextRequest,
): Promise<RequestWithEmailAccount | Response> {
  const authReq = await authMiddleware(req);
  if (authReq instanceof Response) return authReq;

  const userId = authReq.auth.userId;

  // Check for X-Email-Account-ID header
  const emailAccountId = req.headers.get(EMAIL_ACCOUNT_HEADER);

  if (!emailAccountId) {
    return NextResponse.json(
      { error: "Email account ID is required", isKnownError: true },
      { status: 403 },
    );
  }

  // If account ID is provided, validate and get the email account ID
  const email = await getEmailAccount({ userId, emailAccountId });

  if (!email) {
    return NextResponse.json(
      { error: "Invalid account ID", isKnownError: true },
      { status: 403 },
    );
  }

  // Create a new request with email account info
  const emailAccountReq = req.clone() as RequestWithEmailAccount;
  emailAccountReq.auth = { userId, emailAccountId, email };

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
    });

    const providerReq = emailAccountReq.clone() as RequestWithEmailProvider;
    providerReq.auth = emailAccountReq.auth;
    providerReq.emailProvider = provider;

    return providerReq;
  } catch (error) {
    logger.error("Failed to create email provider", {
      error,
      emailAccountId,
      userId,
    });
    return NextResponse.json(
      { error: "Failed to initialize email provider", isKnownError: true },
      { status: 500 },
    );
  }
}

// Public middlewares that build on the common infrastructure
export function withError(handler: NextHandler): NextHandler {
  return withMiddleware(handler);
}

export function withAuth(handler: NextHandler<RequestWithAuth>): NextHandler {
  return withMiddleware(handler, authMiddleware);
}

export function withEmailAccount(
  handler: NextHandler<RequestWithEmailAccount>,
): NextHandler {
  return withMiddleware(handler, emailAccountMiddleware);
}

export function withEmailProvider(
  handler: NextHandler<RequestWithEmailProvider>,
): NextHandler {
  return withMiddleware(handler, emailProviderMiddleware);
}

function isErrorWithConfigAndHeaders(
  error: unknown,
): error is { config: { headers: unknown } } {
  return (
    typeof error === "object" &&
    error !== null &&
    "config" in error &&
    "headers" in (error as { config: any }).config
  );
}
