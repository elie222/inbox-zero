import { env } from "@/env.mjs";
import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (env.NODE_ENV === "development") global.prisma = prisma;

export default prisma;

export function isDuplicateError(error: unknown, key: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta?.target as string[])?.includes?.(key)
  );
}
