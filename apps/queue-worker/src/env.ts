import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import "dotenv/config";

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    PORT: z.number().default(5070),

    // Redis/BullMQ
    REDIS_URL: z.string().url(),

    // Auth for web -> worker (reuse CRON_SECRET)
    CRON_SECRET: z.string(),

    // Callback target for worker -> web
    WEB_BASE_URL: z.string().url(),
    // Optional signing secret for worker -> web
    WORKER_SIGNING_SECRET: z.string().optional(),

    // Tuning
    DEFAULT_CONCURRENCY: z.number().default(3),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
