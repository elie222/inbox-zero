import { ZodError } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import type { StreamingTextResponse } from "ai";
import { setUser } from "@sentry/nextjs";
import {
  captureException,
  isGmailInsufficientPermissionsError,
  isGmailQuotaExceededError,
  isGmailRateLimitExceededError,
  isOpenAIQuotaExceededError,
  SafeError,
} from "@/utils/error";
import { env } from "@/env";
import { posthogCaptureEvent } from "@/utils/posthog";
import { auth } from "@/app/api/auth/[...nextauth]/auth";

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

      if (isGmailInsufficientPermissionsError(error)) {
        console.warn(
          `Gmail insufficient permissions error for url: ${req.url}`,
        );
        await logToPosthog(req, "Gmail Insufficient Permissions");
        return NextResponse.json(
          {
            error:
              "You must grant all Gmail permissions to use the app. Please log out and log in again to grant permissions.",
          },
          { status: 403 },
        );
      }

      if (isGmailRateLimitExceededError(error)) {
        console.warn(`Gmail rate limit exceeded for url: ${req.url}`);
        await logToPosthog(req, "Gmail Rate Limit Exceeded");
        return NextResponse.json(
          {
            error: `You have exceeded the Gmail rate limit. Please try again later. Error from Gmail: "${(error as any)?.errors?.[0]?.message}"`,
          },
          { status: 429 },
        );
      }

      if (isGmailQuotaExceededError(error)) {
        console.warn(`Gmail quota exceeded for url: ${req.url}`);
        await logToPosthog(req, "Gmail Quota Exceeded");
        return NextResponse.json(
          {
            error: "You have exceeded the Gmail quota. Please try again later.",
          },
          { status: 429 },
        );
      }

      if (isOpenAIQuotaExceededError(error)) {
        console.warn(`OpenAI quota exceeded for url: ${req.url}`);
        await logToPosthog(req, "OpenAI Quota Exceeded");
        return NextResponse.json(
          {
            error: `OpenAI error: ${(error as any)?.error?.message}`,
          },
          { status: 429 },
        );
      }

      if (isErrorWithConfigAndHeaders(error)) {
        delete error.config.headers;
      }

      if (error instanceof SafeError) {
        return NextResponse.json({ error: error.safeMessage }, { status: 400 });
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

async function logToPosthog(req: NextRequest, eventName: string) {
  try {
    const session = await auth();
    if (session?.user.email) {
      setUser({ email: session.user.email });
      await posthogCaptureEvent(session.user.email, eventName, {
        $set: { url: req.url },
      });
    }
  } catch (error) {
    console.error("Error logging to PostHog:", error);
  }
}
