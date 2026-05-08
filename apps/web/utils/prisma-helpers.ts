import { Prisma } from "@/generated/prisma/client";

export function isDuplicateError(error: unknown, key?: string | string[]) {
  const duplicateError =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";

  if (!duplicateError || !key) return duplicateError;

  const target = error.meta?.target;
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
