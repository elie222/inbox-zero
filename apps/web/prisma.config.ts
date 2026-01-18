import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    ...(process.env.PREVIEW_DATABASE_URL_UNPOOLED && {
      directUrl: process.env.PREVIEW_DATABASE_URL_UNPOOLED,
    }),
  },
});
