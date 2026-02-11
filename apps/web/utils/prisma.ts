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
      connectionString: normalizeSslMode(
        env.PREVIEW_DATABASE_URL ?? env.DATABASE_URL,
      ),
    }),
  }).$extends(encryptedTokens) as unknown as PrismaClient);

if (env.NODE_ENV === "development") global.prisma = _prisma;

export default _prisma;

function normalizeSslMode(url: string): string {
  try {
    const parsed = new URL(url);
    const sslmode = parsed.searchParams.get("sslmode");
    if (
      sslmode === "require" ||
      sslmode === "prefer" ||
      sslmode === "verify-ca"
    ) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
    return url;
  } catch {
    return url;
  }
}
