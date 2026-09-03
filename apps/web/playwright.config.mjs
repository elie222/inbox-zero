import fs from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const allocatedPorts = new Set();
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
if (todoistBaseUrl) {
  process.env.MCP_SERVER_URL_OVERRIDES = JSON.stringify({
    todoist: `${todoistBaseUrl}/mcp`,
  });
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
    ...(todoistBaseUrl && todoistPort
      ? [
          {
            command: `pnpm exec tsx scripts/todoist-mcp-emulator.ts ${todoistPort}`,
            cwd: process.cwd(),
            url: `${todoistBaseUrl}/health`,
            timeout: 240_000,
            reuseExistingServer: !process.env.CI,
          },
        ]
      : []),
    {
      command: `pnpm exec next dev --turbopack --port ${basePort}`,
      cwd: process.cwd(),
      url: `${baseURL}/login`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        ...process.env,
        NODE_ENV: "development",
        NODE_OPTIONS: nodeOptions,
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
        API_KEY_SALT: process.env.API_KEY_SALT ?? "playwright-api-key-salt",
        INTERNAL_API_KEY: internalApiKey,
        DEFAULT_LLMS: process.env.DEFAULT_LLMS ?? "openai:gpt-5.4-mini",
        OPENAI_API_KEY: "",
        ANTHROPIC_API_KEY: "",
        OPENROUTER_API_KEY: "",
        AI_GATEWAY_API_KEY: "",
        UPSTASH_REDIS_URL: process.env.UPSTASH_REDIS_URL ?? "",
        UPSTASH_REDIS_TOKEN: process.env.UPSTASH_REDIS_TOKEN ?? "",
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
        NEXT_PUBLIC_CONTACTS_ENABLED: "false",
        NEXT_PUBLIC_MEETING_RECORDER_ENABLED: "true",
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
  const redirectUri = new URL("/api/auth/oauth2/callback/google", baseURL).href;
  const meetingStart = new Date(Date.now() + 2 * 60 * 60 * 1000);
  const meetingEnd = new Date(meetingStart.getTime() + 30 * 60 * 1000);
  const profileImage = fs.readFileSync(
    path.join(process.cwd(), "public/splash_screens/icon.png"),
  );

  fs.mkdirSync(outputDir, { recursive: true });

  const seed = fs
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

  fs.writeFileSync(outputPath, seed);

  return outputPath;
}

function createReaderVisualMessage({ attachment, recipient }) {
  const boundary = "playwright-reader-visual-boundary";
  const html = [
    "<div><p>The current reply stays concise and easy to scan.</p>",
    "<p>The attached image should appear as a preview below.</p></div>",
    '<div id="divRplyFwdMsg"><hr><div><b>From:</b> Previous sender</div></div>',
    "<div><p>This earlier quoted message is hidden until expanded.</p></div>",
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
