#!/usr/bin/env bun

import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { program } from "commander";
import * as p from "@clack/prompts";

// Detect if we're running from within the repo
function findRepoRoot(): string | null {
  const cwd = process.cwd();

  // Check if we're in project root (has apps/web directory)
  if (existsSync(resolve(cwd, "apps/web"))) {
    return cwd;
  }

  // Check if we're in apps/web
  if (existsSync(resolve(cwd, "../../apps/web"))) {
    return resolve(cwd, "../..");
  }

  return null;
}

const REPO_ROOT = findRepoRoot();
const IS_REPO_MODE = REPO_ROOT !== null;

// Config paths depend on mode
const CONFIG_DIR = IS_REPO_MODE ? REPO_ROOT : resolve(homedir(), ".inbox-zero");
const ENV_FILE = IS_REPO_MODE
  ? resolve(REPO_ROOT, "apps/web/.env")
  : resolve(CONFIG_DIR, ".env");
const COMPOSE_FILE = IS_REPO_MODE
  ? resolve(REPO_ROOT, "docker-compose.yml")
  : resolve(CONFIG_DIR, "docker-compose.yml");

// Ensure config directory exists (only needed for standalone mode)
function ensureConfigDir() {
  if (!IS_REPO_MODE && !existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// Secret generation
function generateSecret(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

// Check if Docker is available
function checkDocker(): boolean {
  const result = spawnSync("docker", ["--version"], { stdio: "pipe" });
  return result.status === 0;
}

// Check if Docker Compose is available
function checkDockerCompose(): boolean {
  const result = spawnSync("docker", ["compose", "version"], { stdio: "pipe" });
  return result.status === 0;
}

// Environment variable builder
type EnvConfig = Record<string, string | undefined>;

async function main() {
  program
    .name("inbox-zero")
    .description("CLI tool for running Inbox Zero - AI email assistant")
    .version("1.0.0");

  program
    .command("setup")
    .description("Interactive setup for Inbox Zero")
    .action(runSetup);

  program
    .command("start")
    .description("Start Inbox Zero containers")
    .option("-d, --detach", "Run in background", true)
    .action(runStart);

  program
    .command("stop")
    .description("Stop Inbox Zero containers")
    .action(runStop);

  program
    .command("logs")
    .description("View container logs")
    .option("-f, --follow", "Follow log output", false)
    .option("-n, --tail <lines>", "Number of lines to show", "100")
    .action(runLogs);

  program
    .command("status")
    .description("Show status of Inbox Zero containers")
    .action(runStatus);

  program
    .command("update")
    .description("Pull latest Inbox Zero image")
    .action(runUpdate);

  // Default to help if no command
  if (process.argv.length === 2) {
    program.help();
  }

  await program.parseAsync();
}

// ═══════════════════════════════════════════════════════════════════════════
// Setup Command
// ═══════════════════════════════════════════════════════════════════════════

async function runSetup() {
  if (IS_REPO_MODE) {
    p.intro("🚀 Inbox Zero Environment Setup (Repository Mode)");
    p.log.info(`Detected repository at: ${REPO_ROOT}`);
  } else {
    p.intro("🚀 Inbox Zero Setup (Standalone Mode)");

    // Check Docker only in standalone mode
    if (!checkDocker()) {
      p.log.error(
        "Docker is not installed or not running.\n" +
          "Please install Docker Desktop: https://www.docker.com/products/docker-desktop/",
      );
      process.exit(1);
    }

    if (!checkDockerCompose()) {
      p.log.error(
        "Docker Compose is not available.\n" +
          "Please update Docker Desktop or install Docker Compose.",
      );
      process.exit(1);
    }
  }

  ensureConfigDir();

  // Check if already configured
  if (existsSync(ENV_FILE)) {
    const overwrite = await p.confirm({
      message: ".env file already exists. Overwrite it?",
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Setup cancelled. Existing configuration preserved.");
      process.exit(0);
    }
  }

  const env: EnvConfig = {};

  // Default ports
  let webPort = "3000";
  let postgresPort = "5432";
  let redisPort = "8079";

  // ═══════════════════════════════════════════════════════════════════════════
  // Ports Configuration (standalone mode only)
  // ═══════════════════════════════════════════════════════════════════════════

  if (!IS_REPO_MODE) {
    p.note(
      "Configure ports for Inbox Zero services.\nChange these if you have conflicts with existing services.",
      "Port Configuration",
    );

    const ports = await p.group(
      {
        web: () =>
          p.text({
            message: "Web app port",
            placeholder: "3000",
            initialValue: "3000",
            validate: (v) =>
              /^\d+$/.test(v) ? undefined : "Must be a valid port number",
          }),
        postgres: () =>
          p.text({
            message: "PostgreSQL port",
            placeholder: "5432",
            initialValue: "5432",
            validate: (v) =>
              /^\d+$/.test(v) ? undefined : "Must be a valid port number",
          }),
        redis: () =>
          p.text({
            message: "Redis HTTP port",
            placeholder: "8079",
            initialValue: "8079",
            validate: (v) =>
              /^\d+$/.test(v) ? undefined : "Must be a valid port number",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    webPort = ports.web;
    postgresPort = ports.postgres;
    redisPort = ports.redis;

    env.WEB_PORT = webPort;
    env.POSTGRES_PORT = postgresPort;
    env.REDIS_HTTP_PORT = redisPort;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // OAuth Providers
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    "Choose which email providers to support.\nPress Enter to skip any field and add it later.",
    "OAuth Configuration",
  );

  const oauthProviders = await p.multiselect({
    message: "Which OAuth providers do you want to configure?",
    options: [
      { value: "google", label: "Google (Gmail)" },
      { value: "microsoft", label: "Microsoft (Outlook)" },
    ],
    required: true,
  });

  if (p.isCancel(oauthProviders)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const wantsGoogle = oauthProviders.includes("google");
  const wantsMicrosoft = oauthProviders.includes("microsoft");

  // Google OAuth
  if (wantsGoogle) {
    p.note(
      `1. Go to Google Cloud Console: https://console.cloud.google.com/apis/credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add redirect URIs:
   - http://localhost:${webPort}/api/auth/callback/google
   - http://localhost:${webPort}/api/google/linking/callback
4. Copy Client ID and Client Secret

Full guide: https://docs.getinboxzero.com/self-hosting/google-oauth`,
      "Google OAuth Setup",
    );

    const googleOAuth = await p.group(
      {
        clientId: () =>
          p.text({
            message: "Google Client ID (press Enter to skip)",
            placeholder: "123456789012-abcdefghijk.apps.googleusercontent.com",
          }),
        clientSecret: () =>
          p.text({
            message: "Google Client Secret (press Enter to skip)",
            placeholder: "GOCSPX-...",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    env.GOOGLE_CLIENT_ID = googleOAuth.clientId || "your-google-client-id";
    env.GOOGLE_CLIENT_SECRET =
      googleOAuth.clientSecret || "your-google-client-secret";
  } else {
    env.GOOGLE_CLIENT_ID = "skipped";
    env.GOOGLE_CLIENT_SECRET = "skipped";
  }

  // Microsoft OAuth
  if (wantsMicrosoft) {
    p.note(
      `1. Go to Azure Portal: https://portal.azure.com/
2. Navigate to App registrations → New registration
3. Set account type: "Accounts in any organizational directory and personal Microsoft accounts"
4. Add redirect URIs:
   - http://localhost:${webPort}/api/auth/callback/microsoft
   - http://localhost:${webPort}/api/outlook/linking/callback
5. Go to Certificates & secrets → New client secret
6. Copy Application (client) ID and the secret Value

Full guide: https://docs.getinboxzero.com/self-hosting/microsoft-oauth`,
      "Microsoft OAuth Setup",
    );

    const microsoftOAuth = await p.group(
      {
        clientId: () =>
          p.text({
            message: "Microsoft Client ID (press Enter to skip)",
            placeholder: "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
          }),
        clientSecret: () =>
          p.text({
            message: "Microsoft Client Secret (press Enter to skip)",
            placeholder: "your-client-secret",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    env.MICROSOFT_CLIENT_ID =
      microsoftOAuth.clientId || "your-microsoft-client-id";
    env.MICROSOFT_CLIENT_SECRET =
      microsoftOAuth.clientSecret || "your-microsoft-client-secret";
    env.MICROSOFT_TENANT_ID = "common";
    env.MICROSOFT_WEBHOOK_CLIENT_STATE = generateSecret(32);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LLM Provider
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    "Choose your AI provider. You can change this later in settings.",
    "LLM Configuration",
  );

  const llmProvider = await p.select({
    message: "LLM Provider",
    options: [
      { value: "anthropic", label: "Anthropic (Claude)" },
      { value: "openai", label: "OpenAI (GPT)" },
      { value: "google", label: "Google (Gemini)" },
      {
        value: "openrouter",
        label: "OpenRouter",
        hint: "access multiple models",
      },
      { value: "groq", label: "Groq", hint: "fast inference" },
    ],
  });

  if (p.isCancel(llmProvider)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  env.DEFAULT_LLM_PROVIDER = llmProvider;

  const defaultModels: Record<string, { default: string; economy: string }> = {
    anthropic: {
      default: "claude-sonnet-4-5-20250514",
      economy: "claude-haiku-4-5-20250514",
    },
    openai: { default: "gpt-4.1", economy: "gpt-4.1-mini" },
    google: { default: "gemini-2.5-pro", economy: "gemini-2.5-flash" },
    openrouter: {
      default: "anthropic/claude-sonnet-4.5",
      economy: "anthropic/claude-haiku-4.5",
    },
    groq: {
      default: "llama-3.3-70b-versatile",
      economy: "llama-3.1-8b-instant",
    },
  };

  env.DEFAULT_LLM_MODEL = defaultModels[llmProvider].default;
  env.ECONOMY_LLM_PROVIDER = llmProvider;
  env.ECONOMY_LLM_MODEL = defaultModels[llmProvider].economy;

  const llmLinks: Record<string, string> = {
    anthropic: "https://console.anthropic.com/settings/keys",
    openai: "https://platform.openai.com/api-keys",
    google: "https://aistudio.google.com/apikey",
    openrouter: "https://openrouter.ai/settings/keys",
    groq: "https://console.groq.com/keys",
  };

  const apiKeyEnvVar: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
  };

  p.log.info(`Get your API key at:\n${llmLinks[llmProvider]}`);

  const apiKey = await p.text({
    message: `${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)} API Key`,
    placeholder: "sk-...",
    validate: (v) => (!v ? "API key is required for AI features" : undefined),
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  env[apiKeyEnvVar[llmProvider]] = apiKey;

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-generated values
  // ═══════════════════════════════════════════════════════════════════════════

  const spinner = p.spinner();
  spinner.start("Generating configuration...");

  // Redis token
  const redisToken = generateSecret(32);

  if (IS_REPO_MODE) {
    // Repo mode: Use localhost URLs for local development
    env.DATABASE_URL = `postgresql://postgres:password@localhost:${postgresPort}/inboxzero`;
    env.UPSTASH_REDIS_URL = `http://localhost:${redisPort}`;
    env.UPSTASH_REDIS_TOKEN = redisToken;
    env.SRH_TOKEN = redisToken;
    env.NODE_ENV = "development";
  } else {
    // Standalone mode: Use Docker network hostnames
    env.POSTGRES_USER = "postgres";
    env.POSTGRES_PASSWORD = generateSecret(16);
    env.POSTGRES_DB = "inboxzero";
    env.DATABASE_URL = `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@db:5432/${env.POSTGRES_DB}`;
    env.UPSTASH_REDIS_URL = "http://serverless-redis-http:80";
    env.UPSTASH_REDIS_TOKEN = redisToken;
    env.SRH_TOKEN = redisToken;
    env.NODE_ENV = "production";
  }

  // Secrets (same for both modes)
  env.AUTH_SECRET = generateSecret(32);
  env.EMAIL_ENCRYPT_SECRET = generateSecret(32);
  env.EMAIL_ENCRYPT_SALT = generateSecret(16);
  env.INTERNAL_API_KEY = generateSecret(32);
  env.API_KEY_SALT = generateSecret(32);
  env.CRON_SECRET = generateSecret(32);
  env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = generateSecret(32);

  // App config
  env.NEXT_PUBLIC_BASE_URL = `http://localhost:${webPort}`;
  env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = "true";

  spinner.stop("Configuration generated");

  // ═══════════════════════════════════════════════════════════════════════════
  // Write files
  // ═══════════════════════════════════════════════════════════════════════════

  // Only fetch docker-compose.yml in standalone mode
  if (!IS_REPO_MODE) {
    spinner.start("Fetching docker-compose.yml from repository...");

    let composeContent: string;
    try {
      composeContent = await fetchDockerCompose();
    } catch (error) {
      spinner.stop("Failed to fetch docker-compose.yml");
      p.log.error(
        "Could not fetch docker-compose.yml from GitHub.\n" +
          "Please check your internet connection and try again.",
      );
      process.exit(1);
    }

    spinner.stop("Configuration fetched");
    writeFileSync(COMPOSE_FILE, composeContent);
  }

  spinner.start("Writing .env file...");

  // Write .env
  const envContent = Object.entries(env)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  writeFileSync(ENV_FILE, `${envContent}\n`);

  spinner.stop(".env file created");

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  const configuredFeatures = [
    wantsGoogle ? "✓ Google OAuth" : "✗ Google OAuth (skipped)",
    wantsMicrosoft ? "✓ Microsoft OAuth" : "✗ Microsoft OAuth (skipped)",
    `✓ LLM Provider (${llmProvider})`,
    ...(IS_REPO_MODE
      ? []
      : [
          `✓ Web port: ${webPort}`,
          `✓ PostgreSQL port: ${postgresPort}`,
          `✓ Redis HTTP port: ${redisPort}`,
        ]),
  ].join("\n");

  p.note(configuredFeatures, "Configuration Summary");

  p.note(`Environment file saved to:\n${ENV_FILE}`, "Output");

  if (IS_REPO_MODE) {
    p.note(
      "# Start Docker services (database & Redis):\ndocker compose --profile local-db --profile local-redis up -d\n\n# Run database migrations:\npnpm prisma:migrate:dev\n\n# Start the dev server:\npnpm dev\n\n# Then open:\nhttp://localhost:3000",
      "Next Steps",
    );
  } else {
    p.note(
      `# Start Inbox Zero:\ninbox-zero start\n\n# Then open:\nhttp://localhost:${webPort}`,
      "Next Steps",
    );
  }

  p.outro("Setup complete! 🎉");
}

// ═══════════════════════════════════════════════════════════════════════════
// Start Command
// ═══════════════════════════════════════════════════════════════════════════

async function runStart(options: { detach: boolean }) {
  if (IS_REPO_MODE) {
    p.log.info(
      "You're in the repository. Use these commands instead:\n\n" +
        "  docker compose --profile all up -d   # Start all services\n" +
        "  pnpm dev                              # Start dev server\n",
    );
    process.exit(0);
  }

  if (!existsSync(COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.\nRun 'inbox-zero setup' first.");
    process.exit(1);
  }

  p.intro("🚀 Starting Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Pulling latest image...");

  const pullResult = spawnSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "pull"],
    { stdio: "pipe" },
  );

  if (pullResult.status !== 0) {
    spinner.stop("Failed to pull image");
    p.log.error(pullResult.stderr?.toString() || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Image pulled");

  spinner.start("Starting containers...");

  const args = ["compose", "-f", COMPOSE_FILE, "up"];
  if (options.detach) {
    args.push("-d");
  }

  const upResult = spawnSync("docker", args, {
    stdio: options.detach ? "pipe" : "inherit",
  });

  if (upResult.status !== 0 && options.detach) {
    spinner.stop("Failed to start");
    p.log.error(upResult.stderr?.toString() || "Unknown error");
    process.exit(1);
  }

  if (options.detach) {
    spinner.stop("Containers started");

    // Get web port from env
    const envContent = readFileSync(ENV_FILE, "utf-8");
    const webPort = envContent.match(/WEB_PORT=(\d+)/)?.[1] || "3000";

    p.note(
      `Inbox Zero is running at:\nhttp://localhost:${webPort}\n\nView logs: inbox-zero logs\nStop: inbox-zero stop`,
      "Running",
    );

    p.outro("Inbox Zero started! 🎉");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Stop Command
// ═══════════════════════════════════════════════════════════════════════════

async function runStop() {
  if (IS_REPO_MODE) {
    p.log.info("You're in the repository. Use: docker compose down");
    process.exit(0);
  }

  if (!existsSync(COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  p.intro("Stopping Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Stopping containers...");

  const result = spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "down"], {
    stdio: "pipe",
  });

  if (result.status !== 0) {
    spinner.stop("Failed to stop");
    p.log.error(result.stderr?.toString() || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Containers stopped");
  p.outro("Inbox Zero stopped");
}

// ═══════════════════════════════════════════════════════════════════════════
// Logs Command
// ═══════════════════════════════════════════════════════════════════════════

async function runLogs(options: { follow: boolean; tail: string }) {
  if (IS_REPO_MODE) {
    p.log.info("You're in the repository. Use: docker compose logs");
    process.exit(0);
  }

  if (!existsSync(COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  const args = ["compose", "-f", COMPOSE_FILE, "logs", "--tail", options.tail];
  if (options.follow) {
    args.push("-f");
  }

  const child = spawn("docker", args, { stdio: "inherit" });

  await new Promise<void>((resolve, reject) => {
    child.on("close", (code) => {
      if (code === 0 || options.follow) {
        resolve();
      } else {
        reject(new Error(`docker compose logs exited with code ${code}`));
      }
    });
    child.on("error", reject);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Status Command
// ═══════════════════════════════════════════════════════════════════════════

async function runStatus() {
  if (IS_REPO_MODE) {
    p.log.info("You're in the repository. Use: docker compose ps");
    process.exit(0);
  }

  if (!existsSync(COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.\nRun 'inbox-zero setup' first.");
    process.exit(1);
  }

  spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "ps"], {
    stdio: "inherit",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Update Command
// ═══════════════════════════════════════════════════════════════════════════

async function runUpdate() {
  if (IS_REPO_MODE) {
    p.log.info("You're in the repository. Use: git pull");
    process.exit(0);
  }

  if (!existsSync(COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  p.intro("Updating Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Pulling latest image...");

  const pullResult = spawnSync(
    "docker",
    ["compose", "-f", COMPOSE_FILE, "pull"],
    { stdio: "pipe" },
  );

  if (pullResult.status !== 0) {
    spinner.stop("Failed to pull");
    p.log.error(pullResult.stderr?.toString() || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Image updated");

  const restart = await p.confirm({
    message: "Restart with new image?",
    initialValue: true,
  });

  if (p.isCancel(restart)) {
    p.outro("Update complete. Run 'inbox-zero start' to use the new version.");
    return;
  }

  if (restart) {
    spinner.start("Restarting...");

    spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "down"], {
      stdio: "pipe",
    });
    spawnSync("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d"], {
      stdio: "pipe",
    });

    spinner.stop("Restarted");
  }

  p.outro("Update complete! 🎉");
}

// ═══════════════════════════════════════════════════════════════════════════
// Docker Compose Fetcher
// ═══════════════════════════════════════════════════════════════════════════

const COMPOSE_URL =
  "https://raw.githubusercontent.com/elie222/inbox-zero/main/docker-compose.yml";

async function fetchDockerCompose(): Promise<string> {
  const response = await fetch(COMPOSE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch docker-compose.yml: ${response.statusText}`,
    );
  }
  return response.text();
}

main().catch((error) => {
  p.log.error(String(error));
  process.exit(1);
});
