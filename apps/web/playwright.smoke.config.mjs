import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3100";
const basePort = new URL(baseURL).port || "80";
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/postgres";
const emulateBaseUrl = process.env.GOOGLE_BASE_URL ?? "http://localhost:4100";
const smokeTestEmail =
  process.env.SMOKE_TEST_EMAIL ??
  `smoke-test+${Date.now()}@gmail.com`.toLowerCase();
const emulateSeedPath = writeEmulateSeed({
  baseURL,
  smokeTestEmail,
});
const emulateCommand =
  process.env.EMULATE_COMMAND ??
  `npx emulate start --service google --port 4100 --seed ${emulateSeedPath}`;

process.env.SMOKE_TEST_EMAIL = smokeTestEmail;

export default defineConfig({
  testDir: "./__tests__/playwright",
  testMatch: ["smoke.spec.ts"],
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
          process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN ?? "smoke-test-token",
        EMAIL_ENCRYPT_SECRET: process.env.EMAIL_ENCRYPT_SECRET ?? "secret",
        EMAIL_ENCRYPT_SALT: process.env.EMAIL_ENCRYPT_SALT ?? "salt",
        INTERNAL_API_KEY: process.env.INTERNAL_API_KEY ?? "secret",
        DEFAULT_LLM_PROVIDER: process.env.DEFAULT_LLM_PROVIDER ?? "openai",
        SMOKE_TEST_EMAIL: smokeTestEmail,
      },
    },
  ],
});

function writeEmulateSeed({ baseURL, smokeTestEmail }) {
  const templatePath = path.join(process.cwd(), "emulate.smoke.config.yaml");
  const outputDir = path.join(process.cwd(), ".tmp");
  const outputPath = path.join(outputDir, "emulate.smoke.generated.yaml");
  const redirectUri = new URL("/api/auth/oauth2/callback/google", baseURL).href;

  fs.mkdirSync(outputDir, { recursive: true });

  const seed = fs
    .readFileSync(templatePath, "utf8")
    .replaceAll("__SMOKE_TEST_EMAIL__", smokeTestEmail)
    .replaceAll("__SMOKE_TEST_REDIRECT_URI__", redirectUri);

  fs.writeFileSync(outputPath, seed);

  return outputPath;
}
