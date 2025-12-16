#!/usr/bin/env bun

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { program } from "commander";
import * as p from "@clack/prompts";
import { generateSecret, generateEnvFile, type EnvConfig } from "./utils";

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

// Standalone config paths (used for production Docker mode)
const STANDALONE_CONFIG_DIR = resolve(homedir(), ".inbox-zero");
const STANDALONE_ENV_FILE = resolve(STANDALONE_CONFIG_DIR, ".env");
const STANDALONE_COMPOSE_FILE = resolve(
  STANDALONE_CONFIG_DIR,
  "docker-compose.yml",
);

// Ensure config directory exists
function ensureConfigDir(configDir: string) {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
}

// Check if Docker is available
function checkDocker(): boolean {
  const result = spawnSync("docker", ["--version"], { stdio: "pipe" });
  return result.status === 0;
}

// Check if Docker Compose is available (plugin or standalone)
function checkDockerCompose(): boolean {
  // First try the Docker CLI plugin (docker compose)
  const pluginResult = spawnSync("docker", ["compose", "version"], {
    stdio: "pipe",
  });
  if (pluginResult.status === 0) return true;

  // Fallback to standalone docker-compose binary
  const standaloneResult = spawnSync("docker-compose", ["version"], {
    stdio: "pipe",
  });
  return standaloneResult.status === 0;
}

async function main() {
  program
    .name("inbox-zero")
    .description("CLI tool for running Inbox Zero - AI email assistant")
    .version("2.21.38");

  program
    .command("setup")
    .description("Interactive setup for Inbox Zero")
    .action(runSetup);

  program
    .command("start")
    .description("Start Inbox Zero containers")
    .option("--no-detach", "Run in foreground (default: runs in background)")
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
  p.intro("🚀 Inbox Zero Setup");

  // Ask about environment mode
  const envMode = await p.select({
    message: "What environment are you setting up?",
    options: [
      {
        value: "development",
        label: "Development",
        hint: "local dev with pnpm dev",
      },
      {
        value: "production",
        label: "Production",
        hint: "deployed or self-hosted",
      },
    ],
  });

  if (p.isCancel(envMode)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const isDevMode = envMode === "development";

  // Ask about infrastructure
  const infraChoice = await p.select({
    message: "How do you want to run PostgreSQL and Redis?",
    options: [
      {
        value: "docker",
        label: "Docker Compose",
        hint: "spin up containers locally",
      },
      {
        value: "external",
        label: "External / Bring your own",
        hint: "use existing database & Redis",
      },
    ],
  });

  if (p.isCancel(infraChoice)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const useDockerInfra = infraChoice === "docker";

  // Ask if running full stack in Docker (only relevant for Docker infra)
  let runWebInDocker = false;
  if (useDockerInfra) {
    const fullStackDocker = await p.select({
      message: "Do you want to run the full stack in Docker?",
      options: [
        {
          value: "no",
          label: "No, just database & Redis",
          hint: "I'll run Next.js separately with pnpm",
        },
        {
          value: "yes",
          label: "Yes, everything in Docker",
          hint: "docker compose --profile all",
        },
      ],
    });

    if (p.isCancel(fullStackDocker)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    runWebInDocker = fullStackDocker === "yes";
  }

  // Check Docker if needed
  if (useDockerInfra) {
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

  // Determine paths - if in repo, write to apps/web/.env, otherwise use standalone
  const configDir = REPO_ROOT ?? STANDALONE_CONFIG_DIR;
  const envFile = REPO_ROOT
    ? resolve(REPO_ROOT, "apps/web/.env")
    : STANDALONE_ENV_FILE;
  const composeFile = REPO_ROOT
    ? resolve(REPO_ROOT, "docker-compose.yml")
    : STANDALONE_COMPOSE_FILE;

  ensureConfigDir(configDir);

  // Check if already configured
  if (existsSync(envFile)) {
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
  const webPort = "3000";
  const postgresPort = "5432";
  const redisPort = "8079";

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
   - http://localhost:${webPort}/api/outlook/calendar/callback (only required for calendar integration)
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
        tenantId: () =>
          p.text({
            message: "Microsoft Tenant ID",
            placeholder: "common",
            initialValue: "common",
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
    env.MICROSOFT_TENANT_ID = microsoftOAuth.tenantId || "common";
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
      {
        value: "aigateway",
        label: "Vercel AI Gateway",
        hint: "access multiple models",
      },
      { value: "bedrock", label: "AWS Bedrock" },
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
      default: "claude-sonnet-4-5-20250929",
      economy: "claude-haiku-4-5-20251001",
    },
    openai: { default: "gpt-4.1", economy: "gpt-4.1-mini" },
    google: { default: "gemini-2.5-pro", economy: "gemini-2.5-flash" },
    openrouter: {
      default: "anthropic/claude-sonnet-4.5",
      economy: "anthropic/claude-haiku-4.5",
    },
    aigateway: {
      default: "anthropic/claude-sonnet-4.5",
      economy: "anthropic/claude-haiku-4.5",
    },
    bedrock: {
      default: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      economy: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
    },
    groq: {
      default: "llama-3.3-70b-versatile",
      economy: "llama-3.1-8b-instant",
    },
  };

  env.DEFAULT_LLM_MODEL = defaultModels[llmProvider].default;
  env.ECONOMY_LLM_PROVIDER = llmProvider;
  env.ECONOMY_LLM_MODEL = defaultModels[llmProvider].economy;

  // Handle Bedrock separately (needs ACCESS_KEY, SECRET_KEY, REGION)
  if (llmProvider === "bedrock") {
    p.log.info(
      "Get your AWS credentials from the AWS Console:\nhttps://console.aws.amazon.com/iam/",
    );

    const bedrockCreds = await p.group(
      {
        accessKey: () =>
          p.text({
            message: "Bedrock Access Key",
            placeholder: "AKIA...",
            validate: (v) => (!v ? "Access key is required" : undefined),
          }),
        secretKey: () =>
          p.text({
            message: "Bedrock Secret Key",
            placeholder: "your-secret-key",
            validate: (v) => (!v ? "Secret key is required" : undefined),
          }),
        region: () =>
          p.text({
            message: "Bedrock Region",
            placeholder: "us-west-2",
            initialValue: "us-west-2",
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    env.BEDROCK_ACCESS_KEY = bedrockCreds.accessKey;
    env.BEDROCK_SECRET_KEY = bedrockCreds.secretKey;
    env.BEDROCK_REGION = bedrockCreds.region || "us-west-2";
  } else {
    const llmLinks: Record<string, string> = {
      anthropic: "https://console.anthropic.com/settings/keys",
      openai: "https://platform.openai.com/api-keys",
      google: "https://aistudio.google.com/apikey",
      openrouter: "https://openrouter.ai/settings/keys",
      aigateway: "https://vercel.com/docs/ai-gateway",
      groq: "https://console.groq.com/keys",
    };

    const apiKeyEnvVar: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      aigateway: "AI_GATEWAY_API_KEY",
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
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-generated values
  // ═══════════════════════════════════════════════════════════════════════════

  const spinner = p.spinner();
  spinner.start("Generating configuration...");

  // Set NODE_ENV based on environment mode
  env.NODE_ENV = isDevMode ? "development" : "production";

  // Redis token (used for Docker Redis)
  const redisToken = generateSecret(32);

  if (useDockerInfra) {
    // Using Docker Compose for Postgres/Redis
    env.POSTGRES_USER = "postgres";
    env.POSTGRES_PASSWORD = isDevMode ? "password" : generateSecret(16);
    env.POSTGRES_DB = "inboxzero";
    env.UPSTASH_REDIS_TOKEN = redisToken;

    if (runWebInDocker) {
      // Web app runs in Docker: use container hostnames
      env.DATABASE_URL = `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@db:5432/${env.POSTGRES_DB}`;
      env.DIRECT_URL = env.DATABASE_URL;
      env.UPSTASH_REDIS_URL = "http://serverless-redis-http:80";
      env.INTERNAL_API_URL = "http://web:3000";
    } else {
      // Web app runs on host: containers expose ports to localhost
      env.DATABASE_URL = `postgresql://${env.POSTGRES_USER}:${env.POSTGRES_PASSWORD}@localhost:${postgresPort}/${env.POSTGRES_DB}`;
      env.DIRECT_URL = env.DATABASE_URL;
      env.UPSTASH_REDIS_URL = `http://localhost:${redisPort}`;
      env.INTERNAL_API_URL = `http://localhost:${webPort}`;
    }
  } else {
    // External infrastructure - set placeholders for user to fill in
    env.DATABASE_URL = "postgresql://user:password@your-host:5432/inboxzero";
    env.DIRECT_URL = env.DATABASE_URL;
    env.UPSTASH_REDIS_URL = "https://your-redis-url";
    env.UPSTASH_REDIS_TOKEN = "your-redis-token";
  }

  // Secrets (same for both modes)
  env.AUTH_SECRET = generateSecret(32);
  env.EMAIL_ENCRYPT_SECRET = generateSecret(32);
  env.EMAIL_ENCRYPT_SALT = generateSecret(16);
  env.INTERNAL_API_KEY = generateSecret(32);
  env.API_KEY_SALT = generateSecret(32);
  env.CRON_SECRET = generateSecret(32);
  env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = generateSecret(32);
  // Google PubSub topic - required for Gmail push notifications
  // Self-hosters need to set up their own topic in Google Cloud Console
  env.GOOGLE_PUBSUB_TOPIC_NAME =
    "projects/your-project/topics/inbox-zero-emails";

  // App config
  env.NEXT_PUBLIC_BASE_URL = `http://localhost:${webPort}`;
  env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = "true";

  spinner.stop("Configuration generated");

  // ═══════════════════════════════════════════════════════════════════════════
  // Write files
  // ═══════════════════════════════════════════════════════════════════════════

  // Fetch docker-compose.yml if using Docker infra and not in repo
  if (useDockerInfra && !REPO_ROOT) {
    spinner.start("Fetching docker-compose.yml from repository...");

    let composeContent: string;
    try {
      composeContent = await fetchDockerCompose();
    } catch {
      spinner.stop("Failed to fetch docker-compose.yml");
      p.log.error(
        "Could not fetch docker-compose.yml from GitHub.\n" +
          "Please check your internet connection and try again.",
      );
      process.exit(1);
    }

    spinner.stop("Configuration fetched");
    writeFileSync(composeFile, composeContent);
  }

  spinner.start("Fetching .env template...");

  let template: string;
  try {
    template = await getEnvTemplate();
  } catch {
    spinner.stop("Failed to fetch .env template");
    p.log.error(
      "Could not fetch .env.example template.\n" +
        "Please check your internet connection and try again.",
    );
    process.exit(1);
  }

  spinner.stop("Template loaded");
  spinner.start("Writing .env file...");

  // Write .env based on template with user values filled in
  const envContent = generateEnvFile({
    env,
    useDockerInfra,
    llmProvider,
    template,
  });
  writeFileSync(envFile, envContent);

  spinner.stop(".env file created");

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  const configuredFeatures = [
    `✓ Environment: ${isDevMode ? "Development" : "Production"}`,
    `✓ Infrastructure: ${useDockerInfra ? "Docker Compose" : "External"}`,
    useDockerInfra
      ? `✓ Web app: ${runWebInDocker ? "In Docker" : "On host"}`
      : null,
    wantsGoogle ? "✓ Google OAuth" : "✗ Google OAuth (skipped)",
    wantsMicrosoft ? "✓ Microsoft OAuth" : "✗ Microsoft OAuth (skipped)",
    `✓ LLM Provider (${llmProvider})`,
  ]
    .filter(Boolean)
    .join("\n");

  p.note(configuredFeatures, "Configuration Summary");

  p.note(`Environment file saved to:\n${envFile}`, "Output");

  if (!useDockerInfra) {
    p.log.warn(
      "You selected external infrastructure.\n" +
        "Please update DATABASE_URL and UPSTASH_REDIS_URL in your .env file.",
    );
  }

  // Build next steps based on configuration
  let nextSteps: string;

  // For standalone installs, include -f flag to point to the compose file
  const composeCmd = REPO_ROOT
    ? "docker compose"
    : `docker compose -f ${composeFile}`;

  if (runWebInDocker) {
    // Web app runs in Docker with database & Redis
    nextSteps = `# Start all services (web, database & Redis):
NEXT_PUBLIC_BASE_URL=https://yourdomain.com ${composeCmd} --env-file ${envFile} --profile all up -d

# View logs:
docker logs inbox-zero-services-web-1 -f

# Then open:
https://yourdomain.com`;
  } else {
    // Web app runs on host (pnpm dev or pnpm start)
    const dockerStep = useDockerInfra
      ? `# Start Docker services (database & Redis):\n${composeCmd} --profile local-db --profile local-redis up -d\n\n`
      : "";
    const migrateCmd = isDevMode
      ? "pnpm prisma:migrate:dev"
      : "pnpm prisma:migrate:deploy";
    const startCmd = isDevMode ? "pnpm dev" : "pnpm build && pnpm start";

    nextSteps = `${dockerStep}# Run database migrations:
${migrateCmd}

# Start the server:
${startCmd}

# Then open:
http://localhost:${webPort}`;
  }

  p.note(nextSteps, "Next Steps");

  p.outro("Setup complete! 🎉");
}

// ═══════════════════════════════════════════════════════════════════════════
// Start Command
// ═══════════════════════════════════════════════════════════════════════════

async function runStart(options: { detach: boolean }) {
  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error(
      "Inbox Zero is not configured for production mode.\n" +
        "Run 'inbox-zero setup' and choose Production (Docker) first.",
    );
    process.exit(1);
  }

  p.intro("🚀 Starting Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Pulling latest image...");

  const pullResult = spawnSync(
    "docker",
    ["compose", "-f", STANDALONE_COMPOSE_FILE, "pull"],
    { stdio: "pipe" },
  );

  if (pullResult.status !== 0) {
    spinner.stop("Failed to pull image");
    p.log.error(pullResult.stderr?.toString() || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Image pulled");

  if (options.detach) {
    spinner.start("Starting containers...");
  } else {
    spinner.stop("Starting containers in foreground...");
  }

  const args = ["compose", "-f", STANDALONE_COMPOSE_FILE, "up"];
  if (options.detach) {
    args.push("-d");
  }

  const upResult = spawnSync("docker", args, {
    stdio: options.detach ? "pipe" : "inherit",
  });

  if (options.detach) {
    if (upResult.status !== 0) {
      spinner.stop("Failed to start");
      p.log.error(
        upResult.error?.message ||
          upResult.stderr?.toString() ||
          `Unknown error (status: ${upResult.status})`,
      );
      process.exit(1);
    }

    spinner.stop("Containers started");

    // Get web port from env (with safe reading)
    let webPort = "3000";
    if (existsSync(STANDALONE_ENV_FILE)) {
      try {
        const envContent = readFileSync(STANDALONE_ENV_FILE, "utf-8");
        webPort = envContent.match(/WEB_PORT=(\d+)/)?.[1] || webPort;
      } catch {
        // Use default port if env file can't be read
      }
    }

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
  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  p.intro("Stopping Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Stopping containers...");

  const result = spawnSync(
    "docker",
    ["compose", "-f", STANDALONE_COMPOSE_FILE, "down"],
    { stdio: "pipe" },
  );

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
  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  const args = [
    "compose",
    "-f",
    STANDALONE_COMPOSE_FILE,
    "logs",
    "--tail",
    options.tail,
  ];
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
  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.\nRun 'inbox-zero setup' first.");
    process.exit(1);
  }

  spawnSync("docker", ["compose", "-f", STANDALONE_COMPOSE_FILE, "ps"], {
    stdio: "inherit",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Update Command
// ═══════════════════════════════════════════════════════════════════════════

async function runUpdate() {
  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  p.intro("Updating Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Pulling latest image...");

  const pullResult = spawnSync(
    "docker",
    ["compose", "-f", STANDALONE_COMPOSE_FILE, "pull"],
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

    spawnSync("docker", ["compose", "-f", STANDALONE_COMPOSE_FILE, "down"], {
      stdio: "pipe",
    });
    spawnSync(
      "docker",
      ["compose", "-f", STANDALONE_COMPOSE_FILE, "up", "-d"],
      {
        stdio: "pipe",
      },
    );

    spinner.stop("Restarted");
  }

  p.outro("Update complete! 🎉");
}

// ═══════════════════════════════════════════════════════════════════════════
// Env File Generator (template-based)
// ═══════════════════════════════════════════════════════════════════════════

const ENV_EXAMPLE_URL =
  "https://raw.githubusercontent.com/elie222/inbox-zero/main/apps/web/.env.example";

async function fetchEnvExample(): Promise<string> {
  const response = await fetch(ENV_EXAMPLE_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch .env.example: ${response.statusText}`);
  }
  return response.text();
}

async function getEnvTemplate(): Promise<string> {
  if (REPO_ROOT) {
    const templatePath = resolve(REPO_ROOT, "apps/web/.env.example");
    if (existsSync(templatePath)) {
      return readFileSync(templatePath, "utf-8");
    }
  }
  return fetchEnvExample();
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

// Only run main() when executed directly, not when imported for testing
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("main.ts") ||
    process.argv[1].endsWith("inbox-zero.js") ||
    process.argv[1].endsWith("inbox-zero"));

if (isMainModule) {
  main().catch((error) => {
    p.log.error(String(error));
    process.exit(1);
  });
}
