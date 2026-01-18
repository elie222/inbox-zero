import "dotenv/config";
import { defineConfig } from "prisma/config";

const migrationUrl =
  process.env.PREVIEW_DATABASE_URL_UNPOOLED ||
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;

export default defineConfig({
  schema: "./prisma/schema.prisma",
  datasource: {
    url: migrationUrl,
  },
  migrations: {
    path: "./prisma/migrations",
  },
});
