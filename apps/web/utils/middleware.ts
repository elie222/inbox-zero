import { ZodError } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { StreamingTextResponse } from "ai";
import { captureException } from "@/utils/error";
import { env } from "@/env.mjs";

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
          { error: { issues: error.issues } },
          { status: 400 },
        );
      }

      if ((error as any)?.errors?.[0]?.reason === "insufficientPermissions") {
        return NextResponse.json(
          {
            error:
              "You must grant all Gmail permissions to use the app. Please log out and log in again to grant permissions.",
          },
          { status: 403 },
        );
      }

      if ((error as any)?.errors?.[0]?.reason === "rateLimitExceeded") {
        return NextResponse.json(
          {
            error:
              "Gmail rate limit exceeded. Please try refresh the page shortly.",
          },
          { status: 403 },
        );
      }

      if (isErrorWithConfigAndHeaders(error)) {
        delete error.config.headers;
      }

      captureException(error, { extra: { url: req.url, params } });
      console.error(`Error for url: ${req.url}:`);
      console.error(error);
      return NextResponse.json({ error: "Server error" }, { status: 500 });
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
