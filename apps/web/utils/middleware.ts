import { ZodError } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import type { StreamingTextResponse } from "ai";
import {
  captureException,
  checkCommonErrors,
  logErrorToPosthog,
  SafeError,
} from "@/utils/error";
import { env } from "@/env";

export type NextHandler = (
  req: NextRequest,
  { params }: { params: Record<string, string | undefined> },
) => Promise<NextResponse | StreamingTextResponse>;

export function withError(handler: NextHandler): NextHandler {
  return async (req, params) => {
    try {
      return await handler(req, params);
    } catch (error) {
      if (error instanceof ZodError) {
        if (env.LOG_ZOD_ERRORS) {
          console.error(`Error for url: ${req.url}:`);
          console.error(error);
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

      console.error(`Unhandled error for url: ${req.url}:`, error);
      captureException(error, { extra: { url: req.url, params } });

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
