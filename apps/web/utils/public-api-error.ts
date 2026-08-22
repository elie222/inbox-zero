import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SafeError } from "@/utils/error";

export const PUBLIC_API_DOCS_URL =
  "https://docs.getinboxzero.com/api-reference/introduction";
export const PUBLIC_API_OPENAPI_PATH = "/openapi.json";

export type PublicApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export type PublicApiErrorBody = {
  error: {
    code: PublicApiErrorCode;
    message: string;
    hint: string;
  };
};

const DEFAULT_HINTS: Record<PublicApiErrorCode, string> = {
  BAD_REQUEST: `Check the request against ${PUBLIC_API_OPENAPI_PATH} or ${PUBLIC_API_DOCS_URL}.`,
  UNAUTHORIZED: `Include a valid API-Key header. See ${PUBLIC_API_DOCS_URL}.`,
  FORBIDDEN: `Use an account-scoped API key with the required scopes. See ${PUBLIC_API_DOCS_URL}.`,
  NOT_FOUND: `Confirm the path and resource id against ${PUBLIC_API_OPENAPI_PATH} or ${PUBLIC_API_DOCS_URL}.`,
  RATE_LIMITED:
    "Wait and retry with backoff. Reduce request rate if the limit persists.",
  INTERNAL_ERROR: `Retry the request. If it keeps failing, see ${PUBLIC_API_DOCS_URL}.`,
};

export function isPublicApiPath(pathname: string): boolean {
  return pathname === "/api/v1" || pathname.startsWith("/api/v1/");
}

export function publicApiErrorCodeFromStatus(
  status: number,
): PublicApiErrorCode {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "INTERNAL_ERROR";
  return "BAD_REQUEST";
}

export function createPublicApiErrorBody({
  code,
  message,
  hint,
}: {
  code: PublicApiErrorCode;
  message: string;
  hint?: string;
}): PublicApiErrorBody {
  return {
    error: {
      code,
      message,
      hint: hint ?? DEFAULT_HINTS[code],
    },
  };
}

export function publicApiErrorResponse({
  status,
  code,
  message,
  hint,
}: {
  status: number;
  code?: PublicApiErrorCode;
  message: string;
  hint?: string;
}): NextResponse {
  const resolvedCode = code ?? publicApiErrorCodeFromStatus(status);

  return NextResponse.json(
    createPublicApiErrorBody({ code: resolvedCode, message, hint }),
    {
      status,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export function publicApiErrorFromUnknown(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    const issuePath = firstIssue?.path?.length
      ? ` (${firstIssue.path.join(".")})`
      : "";
    const issueMessage = firstIssue?.message
      ? `${firstIssue.message}${issuePath}`
      : "Invalid request";

    return publicApiErrorResponse({
      status: 400,
      code: "BAD_REQUEST",
      message: issueMessage,
    });
  }

  if (error instanceof SafeError) {
    const status =
      typeof error.statusCode === "number" &&
      Number.isInteger(error.statusCode) &&
      error.statusCode >= 400 &&
      error.statusCode <= 599
        ? error.statusCode
        : 400;

    return publicApiErrorResponse({
      status,
      message: error.safeMessage || error.message || "Request failed",
    });
  }

  return publicApiErrorResponse({
    status: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",
  });
}
