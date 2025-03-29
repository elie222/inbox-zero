import { ZodError } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { captureException, checkCommonErrors, SafeError } from "@/utils/error";
import { env } from "@/env";
import { logErrorToPosthog } from "@/utils/error.server";
import { createScopedLogger } from "@/utils/logger";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

const logger = createScopedLogger("middleware");

export type NextHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

export function withError(handler: NextHandler): NextHandler {
  return async (req, context) => {
    try {
      return await handler(req, context);
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
        email: await getEmailFromRequest(),
      });
      captureException(error, { extra: { url: req.url } });

      return NextResponse.json(
        { error: "An unexpected error occurred" },
        { status: 500 },
      );
    }
  };
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

async function getEmailFromRequest() {
  try {
    const session = await auth();
    return session?.user.email;
  } catch (error) {
    logger.error("Error getting email from request", { error });
    return null;
  }
}
