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

  const constraint = getDriverAdapterConstraint(error.meta);
  if (!constraint) return false;
  if ("fields" in constraint) {
    return keys.every((k) => constraint.fields.includes(k));
  }
  return indexNameMatchesKeys(constraint.index, error.meta?.modelName, keys);
}

export function isNotFoundError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}

// Driver adapters report either the violated fields or, when Postgres only
// names the index, the index name.
function getDriverAdapterConstraint(
  meta: Record<string, unknown> | undefined,
): { fields: string[] } | { index: string } | undefined {
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
    return { fields };
  }
  if (typeof index === "string") return { index };
}

// Prisma names unique indexes `<Model>_<field>_<field>_key`. Postgres truncates
// names to 63 characters, which can cut into the last field, so a truncated
// name only matches when it is exactly the caller's full key set, in order.
function indexNameMatchesKeys(
  index: string,
  modelName: unknown,
  keys: string[],
): boolean {
  const segments = index.split("_");
  if (segments.length >= 3 && segments.at(-1) === "key") {
    const fields = segments.slice(1, -1);
    return keys.every((k) => fields.includes(k));
  }
  if (
    index.length !== POSTGRES_MAX_IDENTIFIER_LENGTH ||
    typeof modelName !== "string"
  ) {
    return false;
  }
  const fullName = `${modelName}_${keys.join("_")}_key`;
  return fullName.slice(0, POSTGRES_MAX_IDENTIFIER_LENGTH) === index;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
