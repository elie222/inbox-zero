import { defineConfig } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/postgres";

export default defineConfig({
  testDir: "./__tests__/playwright",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: {
    timeout: 20_000,
  },
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev --webpack",
    cwd: process.cwd(),
    url: `${baseURL}/login`,
    timeout: 240_000,
    reuseExistingServer: !process.env.CI,
    env: {
      ...process.env,
      NODE_ENV: "development",
      NEXT_PUBLIC_BASE_URL: baseURL,
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "secret",
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "client_id",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "client_secret",
      GOOGLE_PUBSUB_TOPIC_NAME: process.env.GOOGLE_PUBSUB_TOPIC_NAME ?? "topic",
      EMAIL_ENCRYPT_SECRET: process.env.EMAIL_ENCRYPT_SECRET ?? "secret",
      EMAIL_ENCRYPT_SALT: process.env.EMAIL_ENCRYPT_SALT ?? "salt",
      INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "secret",
      DEFAULT_LLM_PROVIDER: process.env.DEFAULT_LLM_PROVIDER ?? "openai",
      LOCAL_AUTH_BYPASS_ENABLED:
        process.env.LOCAL_AUTH_BYPASS_ENABLED ?? "true",
    },
  },
});
