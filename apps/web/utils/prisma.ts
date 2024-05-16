import { env } from "@/env.mjs";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  DynamicClientExtensionThis,
  InternalArgs,
} from "@prisma/client/runtime/library";
import { withOptimize } from "@prisma/extension-optimize";

declare global {
  var prisma:
    | DynamicClientExtensionThis<
        Prisma.TypeMap<
          InternalArgs & {
            result: {};
            model: {};
            query: {};
            client: {};
          }
        >,
        Prisma.TypeMapCb,
        {
          result: {};
          model: {};
          query: {};
          client: {};
        }
      >
    | undefined;
}

const prisma = global.prisma || new PrismaClient().$extends(withOptimize());

if (env.NODE_ENV === "development") global.prisma = prisma;

export default prisma;

export function isDuplicateError(error: unknown, key: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    (error.meta?.target as string[])?.includes?.(key)
  );
}
