import { Prisma } from "@/generated/prisma/client";

export function isDuplicateError(error: unknown, key?: string | string[]) {
  const duplicateError =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";

  if (!duplicateError || !key) return duplicateError;

  const target =
    error.meta?.target ?? getDriverAdapterConstraintFields(error.meta);
  const keys = Array.isArray(key) ? key : [key];

  if (typeof target === "string") return keys.every((k) => target.includes(k));

  return Array.isArray(target) && keys.every((k) => target.includes(k));
}

export function isNotFoundError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

// Driver adapters report either the violated fields or, when Postgres only
// names the index, the index name. Prisma names unique indexes
// `<Model>_<field>_<field>_key`, which is parsed back into fields.
function getDriverAdapterConstraintFields(
  meta: Record<string, unknown> | undefined,
): string[] | undefined {
  const driverAdapterError = meta?.driverAdapterError;
  if (!isRecord(driverAdapterError)) return;

  const cause = driverAdapterError.cause;
  if (
    !isRecord(cause) ||
    cause.kind !== "UniqueConstraintViolation" ||
    !isRecord(cause.constraint)
  ) {
    return;
  }

  const { fields, index } = cause.constraint;
  if (
    Array.isArray(fields) &&
    fields.every((field): field is string => typeof field === "string")
  ) {
    return fields;
  }
  if (typeof index !== "string") return;
  const segments = index.split("_");
  if (segments.length < 3 || segments.at(-1) !== "key") return;
  return segments.slice(1, -1);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
