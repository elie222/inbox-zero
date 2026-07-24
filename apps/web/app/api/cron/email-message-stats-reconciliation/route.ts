import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { reconcileConfiguredGmailEmailMessageStats } from "@/utils/email/email-message-stats-reconciliation";
import { type RequestWithLogger, withError } from "@/utils/middleware";

export const maxDuration = 300;

export const GET = withError(
  "cron/email-message-stats-reconciliation",
  async (request) => {
    if (!hasCronSecret(request)) {
      captureException(
        new Error(
          "Unauthorized request: api/cron/email-message-stats-reconciliation",
        ),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    return runEmailMessageStatsReconciliation(
      request,
      parseGetOptions(request),
    );
  },
);

export const POST = withError(
  "cron/email-message-stats-reconciliation",
  async (request) => {
    if (!(await hasPostCronSecret(request))) {
      captureException(
        new Error(
          "Unauthorized cron request: api/cron/email-message-stats-reconciliation",
        ),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json().catch(() => ({}));

    return runEmailMessageStatsReconciliation(request, parseBodyOptions(body));
  },
);

async function runEmailMessageStatsReconciliation(
  request: RequestWithLogger,
  options: ReconciliationRouteOptions,
) {
  const result = await reconcileConfiguredGmailEmailMessageStats({
    logger: request.logger,
    ...options,
  });

  return NextResponse.json(result);
}

function parseGetOptions(request: Request): ReconciliationRouteOptions {
  const url = new URL(request.url);

  return {
    emailAccountId: optionalString(url.searchParams.get("emailAccountId")),
    dryRun: parseBoolean(url.searchParams.get("dryRun"), false),
    accountLimit: parseIntegerOption(url.searchParams.get("accountLimit"), {
      defaultValue: 10,
      min: 1,
      max: 100,
    }),
    batchSize: parseIntegerOption(url.searchParams.get("batchSize"), {
      defaultValue: 25,
      min: 1,
      max: 100,
    }),
    sampleLimit: parseIntegerOption(url.searchParams.get("sampleLimit"), {
      defaultValue: 20,
      min: 0,
      max: 100,
    }),
    maxErrorsPerAccount: parseIntegerOption(
      url.searchParams.get("maxErrorsPerAccount"),
      {
        defaultValue: 5,
        min: 1,
        max: 50,
      },
    ),
  };
}

function parseBodyOptions(body: unknown): ReconciliationRouteOptions {
  const parsedBody = isObject(body) ? body : {};

  return {
    emailAccountId: optionalString(parsedBody.emailAccountId),
    dryRun: parseBoolean(parsedBody.dryRun, false),
    accountLimit: parseIntegerOption(parsedBody.accountLimit, {
      defaultValue: 10,
      min: 1,
      max: 100,
    }),
    batchSize: parseIntegerOption(parsedBody.batchSize, {
      defaultValue: 25,
      min: 1,
      max: 100,
    }),
    sampleLimit: parseIntegerOption(parsedBody.sampleLimit, {
      defaultValue: 20,
      min: 0,
      max: 100,
    }),
    maxErrorsPerAccount: parseIntegerOption(parsedBody.maxErrorsPerAccount, {
      defaultValue: 5,
      min: 1,
      max: 50,
    }),
  };
}

function parseIntegerOption(
  value: unknown,
  {
    defaultValue,
    min,
    max,
  }: {
    defaultValue: number;
    min: number;
    max: number;
  },
) {
  const numericValue =
    typeof value === "number" ? value : parseNumericString(value);

  if (!Number.isInteger(numericValue)) return defaultValue;
  return Math.min(max, Math.max(min, numericValue));
}

function parseNumericString(value: unknown) {
  if (typeof value !== "string") return Number.NaN;

  const trimmed = value.trim();
  if (!trimmed) return Number.NaN;

  return +trimmed;
}

function parseBoolean(value: unknown, defaultValue: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return defaultValue;
  if (value.toLowerCase() === "true") return true;
  if (value.toLowerCase() === "false") return false;
  return defaultValue;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ReconciliationRouteOptions = {
  emailAccountId?: string;
  dryRun: boolean;
  accountLimit: number;
  batchSize: number;
  sampleLimit: number;
  maxErrorsPerAccount: number;
};
