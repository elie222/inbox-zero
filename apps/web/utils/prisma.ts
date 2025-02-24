import { env } from "@/env";
import { Prisma, PrismaClient } from "@prisma/client";
import { encryptedTokens } from "@/utils/prisma-extensions";

declare global {
  var prisma: PrismaClient | undefined;
}

// biome-ignore lint/suspicious/noRedeclare: <explanation>
const prisma = global.prisma || new PrismaClient().$extends(encryptedTokens);

if (env.NODE_ENV === "development") global.prisma = prisma as any;

export default prisma;

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
