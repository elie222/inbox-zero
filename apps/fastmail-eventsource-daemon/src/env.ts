import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    MAIN_APP_URL: z.string().url(),
    INTERNAL_API_KEY: z.string().min(1),
    FASTMAIL_WEBHOOK_SECRET: z.string().min(1),
    ACCOUNT_REFRESH_INTERVAL: z.coerce.number().int().min(1000).default(60_000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
