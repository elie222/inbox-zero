import { Prisma } from "@/generated/prisma/client";

const POSTGRES_MAX_IDENTIFIER_LENGTH = 63;

export function isDuplicateError(error: unknown, key?: string | string[]) {
  const duplicateError =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";

  if (!duplicateError || !key) return duplicateError;

  const keys = Array.isArray(key) ? key : [key];
  const target = error.meta?.target;

  if (typeof target === "string") return keys.every((k) => target.includes(k));
  if (Array.isArray(target)) return keys.every((k) => target.includes(k));

  const constraint = getDriverAdapterConstraintFields(error.meta);
  if (!constraint) return false;
  const { fields, lastFieldTruncated } = constraint;
  const lastField = fields.at(-1);
  return keys.every(
    (k) =>
      fields.includes(k) ||
      (lastFieldTruncated && !!lastField && k.startsWith(lastField)),
  );
}

export function isNotFoundError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

// Driver adapters report either the violated fields or, when Postgres only
// names the index, the index name. Prisma names unique indexes
// `<Model>_<field>_<field>_key`, which is parsed back into fields. Postgres
// truncates long names to 63 characters, which can cut into the last field.
function getDriverAdapterConstraintFields(
  meta: Record<string, unknown> | undefined,
): { fields: string[]; lastFieldTruncated: boolean } | undefined {
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
    return { fields, lastFieldTruncated: false };
  }
  if (typeof index !== "string") return;
  const segments = index.split("_");
  if (segments.length >= 3 && segments.at(-1) === "key") {
    return { fields: segments.slice(1, -1), lastFieldTruncated: false };
  }
  if (index.length === POSTGRES_MAX_IDENTIFIER_LENGTH && segments.length >= 2) {
    return { fields: segments.slice(1), lastFieldTruncated: true };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
