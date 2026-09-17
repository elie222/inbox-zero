import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const allocatedPorts = new Set();
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";
if (production && !process.env.NEXT_PUBLIC_BASE_URL) {
  throw new Error(
    "Production Playwright requires NEXT_PUBLIC_BASE_URL to match the URL used for next build.",
  );
}
const baseURL =
  process.env.NEXT_PUBLIC_BASE_URL ??
  `http://localhost:${await getAvailablePort()}`;
const basePort = getUrlPort(baseURL);
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5433/postgres";
const emulateBaseUrl =
  process.env.GOOGLE_BASE_URL ?? `http://localhost:${await getAvailablePort()}`;
const emulatePort = getUrlPort(emulateBaseUrl);
const emailBaseUrl =
  process.env.PLAYWRIGHT_EMAIL_BASE_URL ??
  `http://127.0.0.1:${await getAvailablePort()}`;
const emailPort = getUrlPort(emailBaseUrl);
process.env.PLAYWRIGHT_EMAIL_BASE_URL = emailBaseUrl;
const stripeBaseUrl =
  process.env.PLAYWRIGHT_STRIPE_BASE_URL ??
  `http://127.0.0.1:${await getAvailablePort()}`;
const stripePort = getUrlPort(stripeBaseUrl);
// Set PLAYWRIGHT_LLM_BASE_URL to run against an external OpenAI-compatible
// server (serving a model named `emulated`) instead of the in-repo emulator.
const externalLlmBaseUrl = process.env.PLAYWRIGHT_LLM_BASE_URL;
const llmBaseUrl =
  externalLlmBaseUrl ?? `http://127.0.0.1:${await getAvailablePort()}`;
const llmPort = getUrlPort(llmBaseUrl);
const llmModelName = "emulated";
const stripeSecretKey = "playwright-stripe-key";
// The emulator accepts any price id; these only have to match what the app was
// built with so the tier lookup resolves.
const stripeEmulatorPriceIds = {
  NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID:
    "price_playwright_starter_monthly",
  NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID:
    "price_playwright_starter_annually",
  NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID: "price_playwright_plus_monthly",
  NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID: "price_playwright_plus_annually",
  NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID:
    "price_playwright_professional_monthly",
  NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID:
    "price_playwright_professional_annually",
};
const stripeWebhookSecret = "whsec_playwright";
const todoistEnabled = process.env.PLAYWRIGHT_TODOIST_ENABLED === "true";
const todoistBaseUrl = todoistEnabled
  ? `http://localhost:${await getAvailablePort()}`
  : undefined;
const todoistPort = todoistBaseUrl ? getUrlPort(todoistBaseUrl) : undefined;
const internalApiKey = process.env.INTERNAL_API_KEY ?? "secret";
const nodeOptions = process.env.NODE_OPTIONS ?? "--max_old_space_size=6144";
const runId = process.env.PLAYWRIGHT_RUN_ID ?? `${process.pid}-${Date.now()}`;
const playwrightTestEmail =
  process.env.PLAYWRIGHT_TEST_EMAIL ??
  `playwright-test+${runId}@gmail.com`.toLowerCase();
const blobReportFile = process.env.PLAYWRIGHT_BLOB_REPORT_FILE;
const authStatePath = path.join(
  process.cwd(),
  ".tmp",
  "playwright",
  runId,
  "auth.json",
);
const emulateSeedPath = writeEmulateSeed({
  baseURL,
  playwrightTestEmail,
  runId,
});
const emulateCommand =
  process.env.EMULATE_COMMAND ??
  `npx emulate start --service google --port ${emulatePort} --seed ${emulateSeedPath}`;

fs.mkdirSync(path.dirname(authStatePath), { recursive: true });
process.env.DATABASE_URL = databaseUrl;
process.env.GOOGLE_BASE_URL = emulateBaseUrl;
process.env.INTERNAL_API_KEY = internalApiKey;
process.env.NEXT_PUBLIC_BASE_URL = baseURL;
process.env.NODE_OPTIONS = nodeOptions;
process.env.PLAYWRIGHT_AUTH_FILE = authStatePath;
process.env.PLAYWRIGHT_RUN_ID = runId;
process.env.PLAYWRIGHT_TEST_EMAIL = playwrightTestEmail;
process.env.PLAYWRIGHT_STRIPE_BASE_URL = stripeBaseUrl;
process.env.PLAYWRIGHT_LLM_BASE_URL = llmBaseUrl;
// Only a default. Production runs freeze NEXT_PUBLIC_* into the build, which
// happens in a separate job before this config loads, so those runs must set
// these in the workflow and have their values win here.
for (const [key, priceId] of Object.entries(stripeEmulatorPriceIds)) {
  process.env[key] ??= priceId;
}
if (todoistBaseUrl) {
  process.env.PLAYWRIGHT_TODOIST_BASE_URL = todoistBaseUrl;
}

export default defineConfig({
  testDir: "./__tests__/playwright",
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR,
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  // Every browser test shares one seeded provider and one authenticated account.
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 240_000,
  expect: {
    timeout: 20_000,
  },
  reporter: blobReportFile
    ? [
        ...(process.env.CI ? [["github"]] : []),
        ["list"],
        ["blob", { outputFile: blobReportFile }],
      ]
    : [
        ...(process.env.CI ? [["github"]] : []),
        ["list"],
        ["html", { open: "never", outputFolder: "playwright-report" }],
      ],
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
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
      name: "Email emulator",
      stdout: "pipe",
      command: `node __tests__/playwright/email-server.mjs ${emailPort}`,
      cwd: process.cwd(),
      url: emailBaseUrl,
      timeout: 30_000,
    },
    {
      name: "Google emulator",
      stdout: "pipe",
      command: emulateCommand,
      cwd: process.cwd(),
      url: `${emulateBaseUrl}/.well-known/openid-configuration`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
    },
    ...(todoistBaseUrl && todoistPort
      ? [
          {
            name: "Todoist emulator",
            stdout: "pipe",
            command: `pnpm exec tsx scripts/todoist-mcp-emulator.ts ${todoistPort}`,
            cwd: process.cwd(),
            url: `${todoistBaseUrl}/health`,
            timeout: 240_000,
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    {
      name: "Stripe emulator",
      stdout: "pipe",
      command: `pnpm exec tsx scripts/run-stripe-emulator.ts ${stripePort}`,
      cwd: process.cwd(),
      url: `${stripeBaseUrl}/health`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        ...process.env,
        STRIPE_EMULATOR_WEBHOOK_URL: `${baseURL}/api/stripe/webhook`,
        STRIPE_SECRET_KEY: stripeSecretKey,
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
      },
    },
    ...(externalLlmBaseUrl
      ? []
      : [
          {
            name: "LLM emulator",
            stdout: "pipe",
            command: `pnpm exec tsx scripts/run-llm-emulator.ts ${llmPort}`,
            cwd: process.cwd(),
            url: `${llmBaseUrl}/health`,
            timeout: 60_000,
            reuseExistingServer: false,
            env: { ...process.env, LLM_EMULATOR_MODEL: llmModelName },
          },
        ]),
    {
      name: "Next.js",
      stdout: "pipe",
      command: `${
        todoistEnabled
          ? "pnpm exec node --import tsx --import ./__tests__/playwright/todoist-transport.ts node_modules/next/dist/bin/next"
          : "pnpm exec next"
      } ${production ? "start" : "dev --turbopack"} --port ${basePort}`,
      cwd: process.cwd(),
      url: `${baseURL}/api/auth/ok`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        MCP_SERVER_URL_OVERRIDES: "",
        NODE_ENV: production ? "production" : "development",
        NODE_OPTIONS: nodeOptions,
        NEXT_PUBLIC_BASE_URL: baseURL,
        DATABASE_URL: databaseUrl,
        PREVIEW_DATABASE_URL: databaseUrl,
        AUTH_SECRET: process.env.AUTH_SECRET ?? "secret",
        ...(process.env.PLAYWRIGHT_SCIM_TEST === "true" && {
          ADMINS: playwrightTestEmail,
          SCIM_CREDENTIAL_HASH_SECRET:
            "playwright-only-scim-credential-secret-32-characters",
        }),
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
        API_KEY_SALT: process.env.API_KEY_SALT ?? "playwright-api-key-salt",
        INTERNAL_API_KEY: internalApiKey,
        // Every model role resolves to the emulator so no spec depends on a
        // live provider.
        DEFAULT_LLMS: `openai-compatible:${llmModelName}`,
        ECONOMY_LLMS: "",
        CHAT_LLMS: "",
        NANO_LLMS: "",
        DRAFT_LLMS: "",
        OPENAI_COMPATIBLE_BASE_URL: `${llmBaseUrl}/v1`,
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENROUTER_API_KEY: "",
        AI_GATEWAY_API_KEY: "",
        UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_URL ?? "",
        UPSTASH_REDIS_TOKEN: process.env.UPSTASH_REDIS_TOKEN ?? "",
        QSTASH_TOKEN: "",
        QSTASH_CURRENT_SIGNING_KEY: "",
        QSTASH_NEXT_SIGNING_KEY: "",
        RESEND_API_KEY: "playwright-email-key",
        RESEND_BASE_URL: emailBaseUrl,
        RESEND_AUDIENCE_ID: "playwright-audience",
        RESEND_FROM_EMAIL: "Inbox Zero <signin@example.com>",
        LOOPS_API_SECRET: "",
        DUB_API_KEY: "",
        FB_CONVERSION_API_ACCESS_TOKEN: "",
        FB_PIXEL_ID: "",
        CONVERSION_ANALYTICS_SERVER_URL: "",
        CONVERSION_ANALYTICS_SERVER_SECRET: "",
        POSTHOG_API_SECRET: "",
        NEXT_PUBLIC_POSTHOG_KEY: "",
        NEXT_PUBLIC_POSTHOG_API_HOST: "",
        NEXT_PUBLIC_DUB_REFER_DOMAIN: "",
        NEXT_PUBLIC_IS_RESEND_CONFIGURED: "",
        NEXT_PUBLIC_CONTACTS_ENABLED:
          process.env.NEXT_PUBLIC_CONTACTS_ENABLED ?? "true",
        NEXT_PUBLIC_EMAIL_SEND_ENABLED: "true",
        NEXT_PUBLIC_MEETING_RECORDER_ENABLED: "true",
        NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: "",
        STRIPE_API_BASE_URL: stripeBaseUrl,
        STRIPE_SECRET_KEY: stripeSecretKey,
        STRIPE_WEBHOOK_SECRET: stripeWebhookSecret,
        PLAYWRIGHT_TEST_EMAIL: playwrightTestEmail,
      },
    },
  ],
});

function writeEmulateSeed({ baseURL, playwrightTestEmail, runId }) {
  const templatePath = path.join(
    process.cwd(),
    "emulate.playwright.config.yaml",
  );
  const outputDir = path.join(process.cwd(), ".tmp", "playwright", runId);
  const outputPath = path.join(outputDir, "emulate.playwright.generated.yaml");
  const redirectUri = new URL("/api/auth/callback/google", baseURL).href;
  const meetingStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const meetingEnd = new Date(meetingStart.getTime() + 30 * 60 * 1000);
  const profileImage = fs.readFileSync(
    path.join(process.cwd(), "public/splash_screens/icon.png"),
  );

  fs.mkdirSync(outputDir, { recursive: true });

  let seed = fs
    .readFileSync(templatePath, "utf8")
    .replaceAll("__PLAYWRIGHT_TEST_EMAIL__", playwrightTestEmail)
    .replaceAll("__PLAYWRIGHT_TEST_REDIRECT_URI__", redirectUri)
    .replaceAll("__PLAYWRIGHT_MEETING_START__", meetingStart.toISOString())
    .replaceAll("__PLAYWRIGHT_MEETING_END__", meetingEnd.toISOString())
    .replaceAll(
      "__PLAYWRIGHT_PROFILE_PICTURE__",
      `data:image/png;base64,${profileImage.toString("base64")}`,
    )
    .replaceAll(
      "__PLAYWRIGHT_READER_VISUAL_RAW__",
      createReaderVisualMessage({
        attachment: profileImage,
        recipient: playwrightTestEmail,
      }),
    );

  // Mailbox synchronization only covers recent mail. Preserve the fixture's
  // ordering without letting fixed seed dates age out of that window.
  const messageDates = [
    ...new Set(
      [...seed.matchAll(/internal_date: "(\d+)"/g)].map((match) =>
        Number(match[1]),
      ),
    ),
  ].sort((left, right) => right - left);
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  seed = seed.replaceAll(/internal_date: "(\d+)"/g, (_, timestamp) => {
    const date =
      yesterday - messageDates.indexOf(Number(timestamp)) * 60 * 60 * 1000;
    return `internal_date: "${date}"`;
  });

  fs.writeFileSync(outputPath, seed);

  return outputPath;
}

function createReaderVisualMessage({ attachment, recipient }) {
  const boundary = "playwright-reader-visual-boundary";
  const html = [
    '<!doctype html><html lang="en"><head><style>p { margin: 0 0 16px; }</style></head>',
    '<body style="margin: 0; padding: 16px; background: #232326; color: #f4e9da; font-family: Arial, sans-serif">',
    "<div><p>The current reply stays concise and easy to scan.</p>",
    "<p>The attached image should appear as a preview below.</p></div>",
    '<div id="divRplyFwdMsg"><hr><div><b>From:</b> Previous sender</div></div>',
    "<div><p>This earlier quoted message is hidden until expanded.</p></div>",
    "</body></html>",
  ].join("");
  const mime = [
    "From: Morgan Example <morgan@example.com>",
    `To: ${recipient}`,
    "Subject: Re: Reader Visual Message",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    `--${boundary}`,
    'Content-Type: image/png; name="reader-preview.png"',
    'Content-Disposition: attachment; filename="reader-preview.png"',
    "Content-Transfer-Encoding: base64",
    "",
    attachment.toString("base64"),
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return Buffer.from(mime, "utf8").toString("base64url");
}

function getUrlPort(url) {
  const parsed = new URL(url);
  if (parsed.port) return parsed.port;
  return parsed.protocol === "https:" ? "443" : "80";
}

function getAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a local Playwright port"));
        return;
      }
      server.close(() => {
        if (allocatedPorts.has(address.port)) {
          getAvailablePort().then(resolve, reject);
          return;
        }
        allocatedPorts.add(address.port);
        resolve(address.port);
      });
    });
  });
}
