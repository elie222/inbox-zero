import { env } from "@/env";
import { Prisma } from "@/generated/prisma/client";
import { getAuditContext } from "@/utils/audit/context";
import {
  isAuditLoggingEnabled,
  recordAuditEvent,
  type AuditEvent,
} from "@/utils/audit/delivery";

type QueryExtensionArgs = {
  model?: string;
  operation: string;
  args: unknown;
  query: (args: unknown) => Promise<unknown>;
};

const READ_OPERATIONS = new Set([
  "aggregate",
  "count",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "groupBy",
]);

const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "delete",
  "deleteMany",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
]);

export const auditPrismaQueries = Prisma.defineExtension((client) =>
  client.$extends({
    name: "auditPrismaQueries",
    query: {
      $allModels: {
        async $allOperations(params: QueryExtensionArgs) {
          return auditPrismaOperation(params);
        },
      },
    } as never,
  }),
);

export const __testing__ = {
  auditPrismaOperation,
  classifyOperation,
  getResultCount,
};

async function auditPrismaOperation({
  model,
  operation,
  args,
  query,
}: QueryExtensionArgs) {
  if (!isAuditLoggingEnabled()) {
    return query(args);
  }

  const startedAt = Date.now();

  try {
    const result = await query(args);
    emitAuditEvent({
      model,
      operation,
      status: "success",
      durationMs: Date.now() - startedAt,
      resultCount: getResultCount(result),
    });
    return result;
  } catch (error) {
    emitAuditEvent({
      model,
      operation,
      status: "error",
      durationMs: Date.now() - startedAt,
      resultCount: null,
      errorName: getErrorName(error),
    });
    throw error;
  }
}

function emitAuditEvent({
  model,
  operation,
  status,
  durationMs,
  resultCount,
  errorName,
}: {
  model?: string;
  operation: string;
  status: AuditEvent["status"];
  durationMs: number;
  resultCount: number | null;
  errorName?: string;
}) {
  if (!model) return;

  const context = getAuditContext();
  const event: AuditEvent = {
    _time: new Date().toISOString(),
    event_type: "db_access",
    model,
    operation,
    op_class: classifyOperation(operation),
    status,
    duration_ms: durationMs,
    result_count: resultCount,
    actor_type: context.actorType ?? null,
    user_id: context.userId ?? null,
    email_account_id: context.emailAccountId ?? null,
    api_key_id: context.apiKeyId ?? null,
    source: context.source ?? null,
    request_id: context.requestId ?? null,
    env: process.env.VERCEL_ENV ?? env.NODE_ENV ?? "unknown",
    region: process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? null,
    ...(errorName ? { error_name: errorName } : {}),
  };

  try {
    recordAuditEvent(event);
  } catch {
    // Audit logging must not affect the database operation.
  }
}

function classifyOperation(operation: string): AuditEvent["op_class"] {
  if (READ_OPERATIONS.has(operation)) return "read";
  if (WRITE_OPERATIONS.has(operation)) return "write";
  return "other";
}

function getResultCount(result: unknown): number | null {
  if (Array.isArray(result)) return result.length;
  if (typeof result === "number") return result;
  if (result === null || result === undefined) return 0;
  if (isCountResult(result)) return result.count;
  if (typeof result === "object") return 1;
  return null;
}

function isCountResult(value: unknown): value is { count: number } {
  return (
    typeof value === "object" &&
    value !== null &&
    "count" in value &&
    typeof value.count === "number"
  );
}

function getErrorName(error: unknown) {
  if (error instanceof Error) return error.name;
  return "UnknownError";
}
