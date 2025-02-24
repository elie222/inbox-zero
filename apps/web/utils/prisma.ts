import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { encryptedTokens } from "@/utils/prisma-extensions";

declare global {
  var prisma: PrismaClient | undefined;
}

// Create the Prisma client with extensions, but cast it back to PrismaClient for type compatibility
const _prisma =
  global.prisma ||
  (new PrismaClient().$extends(encryptedTokens) as unknown as PrismaClient);

if (env.NODE_ENV === "development") global.prisma = _prisma;

export default _prisma;

export function isDuplicateError(error: unknown, key?: string) {
  const duplicateError =
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002";

  if (key)
    return duplicateError && (error.meta?.target as string[])?.includes?.(key);

  return duplicateError;
}

export function isNotFoundError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2025"
  );
}
