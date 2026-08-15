import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100";
const basePort = new URL(baseURL).port || "80";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/postgres";
const emulateBaseUrl = process.env.GOOGLE_BASE_URL ?? "http://localhost:4100";
const playwrightTestEmail =
  process.env.PLAYWRIGHT_TEST_EMAIL ??
  `playwright-test+${Date.now()}@gmail.com`.toLowerCase();
const authStatePath = path.join(
  process.cwd(),
  ".tmp",
  "playwright",
  "auth.json",
);
const emulateSeedPath = writeEmulateSeed({
  baseURL,
  playwrightTestEmail,
});
const emulateCommand =
  process.env.EMULATE_COMMAND ??
  `npx emulate start --service google --port 4100 --seed ${emulateSeedPath}`;

fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
process.env.DATABASE_URL = databaseUrl;
process.env.PLAYWRIGHT_AUTH_FILE = authStatePath;
process.env.PLAYWRIGHT_TEST_EMAIL = playwrightTestEmail;

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
  projects: [
    {
      name: "emulated-setup",
      testMatch: ["emulated/setup/**/*.setup.ts"],
    },
    {
      name: "emulated",
      dependencies: ["emulated-setup"],
      testMatch: ["emulated/**/*.spec.ts"],
      use: {
        storageState: authStatePath,
      },
    },
  ],
  webServer: [
    {
      command: emulateCommand,
      cwd: process.cwd(),
      url: `${emulateBaseUrl}/.well-known/openid-configuration`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `pnpm exec next dev --webpack --port ${basePort}`,
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
        GOOGLE_CLIENT_SECRET:
          process.env.GOOGLE_CLIENT_SECRET ?? "client_secret",
        GOOGLE_BASE_URL: emulateBaseUrl,
        GOOGLE_PUBSUB_TOPIC_NAME:
          process.env.GOOGLE_PUBSUB_TOPIC_NAME ?? "topic",
        GOOGLE_PUBSUB_VERIFICATION_TOKEN:
          process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN ?? "playwright-token",
        EMAIL_ENCRYPT_SECRET: process.env.EMAIL_ENCRYPT_SECRET ?? "secret",
        EMAIL_ENCRYPT_SALT: process.env.EMAIL_ENCRYPT_SALT ?? "salt",
        INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "secret",
        DEFAULT_LLMS: process.env.DEFAULT_LLMS ?? "openai:gpt-5.4-mini",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENROUTER_API_KEY: "",
        AI_GATEWAY_API_KEY: "",
        UPSTASH_REDIS_URL:
          process.env.UPSTASH_REDIS_URL ?? "http://localhost:8079",
        UPSTASH_REDIS_TOKEN:
          process.env.UPSTASH_REDIS_TOKEN ?? "playwright-token",
        QSTASH_TOKEN: "",
        QSTASH_CURRENT_SIGNING_KEY: "",
        QSTASH_NEXT_SIGNING_KEY: "",
        RESEND_API_KEY: "",
        RESEND_AUDIENCE_ID: "",
        RESEND_FROM_EMAIL: "",
        LOOPS_API_SECRET: "",
        DUB_API_KEY: "",
        POSTHOG_API_SECRET: "",
        NEXT_PUBLIC_POSTHOG_KEY: "",
        NEXT_PUBLIC_POSTHOG_API_HOST: "",
        NEXT_PUBLIC_DUB_REFER_DOMAIN: "",
        NEXT_PUBLIC_IS_RESEND_CONFIGURED: "",
        PLAYWRIGHT_TEST_EMAIL: playwrightTestEmail,
      },
    },
  ],
});

function writeEmulateSeed({ baseURL, playwrightTestEmail }) {
  const templatePath = path.join(
    process.cwd(),
    "emulate.playwright.config.yaml",
  );
  const outputDir = path.join(process.cwd(), ".tmp");
  const outputPath = path.join(outputDir, "emulate.playwright.generated.yaml");
  const redirectUri = new URL("/api/auth/oauth2/callback/google", baseURL).href;

  fs.mkdirSync(outputDir, { recursive: true });

  const seed = fs
    .readFileSync(templatePath, "utf8")
    .replaceAll("__PLAYWRIGHT_TEST_EMAIL__", playwrightTestEmail)
    .replaceAll("__PLAYWRIGHT_TEST_REDIRECT_URI__", redirectUri);

  fs.writeFileSync(outputPath, seed);

  return outputPath;
}
