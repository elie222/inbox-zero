import { env } from "@/env.mjs";
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const prisma = global.prisma || new PrismaClient();

if (env.NODE_ENV === "development") global.prisma = prisma;

export default prisma;
