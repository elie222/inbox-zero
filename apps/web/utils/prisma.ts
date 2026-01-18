import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@/env";
import { PrismaClient } from "@/generated/prisma/client";
import { encryptedTokens } from "@/utils/prisma-extensions";

declare global {
  var prisma: PrismaClient | undefined;
}

// Create the Prisma client with extensions, but cast it back to PrismaClient for type compatibility
const _prisma =
  global.prisma ||
  (new PrismaClient({
    adapter: new PrismaPg({
      connectionString: env.PREVIEW_DATABASE_URL ?? env.DATABASE_URL,
    }),
  }).$extends(encryptedTokens) as unknown as PrismaClient);

if (env.NODE_ENV === "development") global.prisma = _prisma;

export default _prisma;
