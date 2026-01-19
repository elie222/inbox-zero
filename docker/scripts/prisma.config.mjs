// Docker-specific Prisma config for migrations
// Env vars are already set by container runtime, no dotenv needed
import { defineConfig } from "prisma/config";

const migrationUrl =
  process.env.PREVIEW_DATABASE_URL_UNPOOLED ||
  process.env.PREVIEW_DATABASE_URL ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;

export default defineConfig({
  schema: "./apps/web/prisma/schema.prisma",
  datasource: {
    url: migrationUrl,
  },
  migrations: {
    path: "./apps/web/prisma/migrations",
  },
});
