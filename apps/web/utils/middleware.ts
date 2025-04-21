import { ZodError } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { captureException, checkCommonErrors, SafeError } from "@/utils/error";
import { env } from "@/env";
import { logErrorToPosthog } from "@/utils/error.server";
import { createScopedLogger } from "@/utils/logger";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { validateUserAccount } from "@/utils/redis/account-validation";

const logger = createScopedLogger("middleware");

export type NextHandler<T extends NextRequest = NextRequest> = (
  req: T,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

// Extended request type with validated account info
export interface RequestWithAuth extends NextRequest {
  auth: {
    userId: string;
    userEmail: string;
  };
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
        console.error(error);
      }

      logger.error("Unhandled error", {
        error,
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

  const userId = session.user.id;
  let userEmail = session.user.email;

  // Check for X-Account-ID header
  const accountId = req.headers.get("X-Account-ID");

  // If account ID is provided, validate and get the email account ID
  if (accountId) {
    userEmail = await validateUserAccount(userId, accountId);
  }

  if (!userEmail) {
    return NextResponse.json(
      { error: "Invalid account ID", isKnownError: true },
      { status: 403 },
    );
  }

  // Create a new request with auth info
  const authReq = req.clone() as RequestWithAuth;
  authReq.auth = { userId, userEmail };

  return authReq;
}

// Public middlewares that build on the common infrastructure
export function withError(handler: NextHandler): NextHandler {
  return withMiddleware(handler);
}

export function withAuth(handler: NextHandler<RequestWithAuth>): NextHandler {
  return withMiddleware(handler, authMiddleware);
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
