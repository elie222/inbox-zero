#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { program } from "commander";
import * as p from "@clack/prompts";
import {
  generateSecret,
  generateEnvFile,
  isSensitiveKey,
  parseEnvFile,
  parsePortConflict,
  updateEnvValue,
  redactValue,
  type EnvConfig,
} from "./utils";
import { runGoogleSetup } from "./setup-google";
import { runAwsSetup } from "./setup-aws";
import { runTerraformSetup } from "./setup-terraform";
import packageJson from "../package.json" with { type: "json" };

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

function requireDocker() {
  if (!checkDocker()) {
    const platform = process.platform;
    let installMsg =
      "Please install Docker Desktop: https://www.docker.com/products/docker-desktop/";
    if (platform === "win32") {
      installMsg =
        "Please install Docker Desktop for Windows:\nhttps://docs.docker.com/desktop/setup/install/windows-install/";
    } else if (platform === "darwin") {
      installMsg =
        "Please install Docker Desktop for Mac:\nhttps://docs.docker.com/desktop/setup/install/mac-install/";
    } else if (platform === "linux") {
      installMsg =
        "Please install Docker Engine:\nhttps://docs.docker.com/engine/install/";
    }
    p.log.error(`Docker is not installed or not running.\n${installMsg}`);
    process.exit(1);
  }

  if (!checkDockerCompose()) {
    p.log.error(
      "Docker Compose is not available.\n" +
        "Please update Docker Desktop or install Docker Compose:\n" +
        "https://docs.docker.com/compose/install/",
    );
    process.exit(1);
  }
}

// When running in standalone mode (~/.inbox-zero/), the compose file's
// env_file references to ./apps/web/.env won't resolve. Rewrite them
// to ./.env so they point to the .env in the same directory.
function fixComposeEnvPaths(composeContent: string): string {
  return composeContent
    .replace(/- path: .\/apps\/web\/.env/g, "- path: ./.env")
    .replace(/- .\/apps\/web\/.env/g, "- ./.env");
}

function findEnvFile(name?: string): string | null {
  const envFileName = name ? `.env.${name}` : ".env";

  if (REPO_ROOT) {
    const repoEnv = resolve(REPO_ROOT, "apps/web", envFileName);
    if (existsSync(repoEnv)) return repoEnv;
  }

  const standaloneEnv = resolve(STANDALONE_CONFIG_DIR, envFileName);
  if (existsSync(standaloneEnv)) return standaloneEnv;

  return null;
}

async function main() {
  stripSetupAwsDoubleDash(process.argv);

  program
    .name("inbox-zero")
    .description(
      "CLI tool for self-hosting Inbox Zero — AI email assistant.\n\n" +
        "Quick start:\n" +
        "  inbox-zero setup      Configure OAuth providers, AI provider, and Docker\n" +
        "  inbox-zero start      Start Inbox Zero\n" +
        "  inbox-zero config     View and update settings\n\n" +
        "Docs: https://docs.getinboxzero.com/self-hosting",
    )
    .version(packageJson.version, "-v, --version");

  program
    .command("setup")
    .description("Interactive setup wizard")
    .option("-n, --name <name>", "Configuration name (creates .env.<name>)")
    .action(runSetup);

  program
    .command("start")
    .description("Start Inbox Zero")
    .option("--no-detach", "Run in foreground (default: background)")
    .action(runStart);

  program.command("stop").description("Stop Inbox Zero").action(runStop);

  program
    .command("logs")
    .description("View container logs")
    .option("-f, --follow", "Follow log output", false)
    .option("-n, --tail <lines>", "Number of lines to show", "100")
    .action(runLogs);

  program
    .command("status")
    .description("Show container status")
    .action(runStatus);

  program
    .command("update")
    .description("Update to the latest version")
    .action(runUpdate);

  const configCmd = program
    .command("config")
    .description("View and update configuration")
    .option("-n, --name <name>", "Configuration name (e.g., staging)");

  configCmd
    .command("set <key> <value>")
    .description("Set a configuration value")
    .action((key: string, value: string) => {
      const name = configCmd.opts().name;
      return runConfigSet(key, value, name);
    });

  configCmd
    .command("get <key>")
    .description("Get a configuration value")
    .action((key: string) => {
      const name = configCmd.opts().name;
      return runConfigGet(key, name);
    });

  configCmd.action(() => {
    const name = configCmd.opts().name;
    return runConfigInteractive(name);
  });

  program
    .command("setup-google")
    .description(
      "Set up Google Cloud APIs, OAuth, and Pub/Sub using gcloud CLI",
    )
    .option("--project-id <id>", "Google Cloud project ID")
    .option("--domain <domain>", "Your app domain (e.g., app.example.com)")
    .option("--skip-oauth", "Skip OAuth credential setup guidance")
    .option("--skip-pubsub", "Skip Pub/Sub setup")
    .action(runGoogleSetup);

  program
    .command("setup-aws")
    .description("Deploy Inbox Zero to AWS using Copilot (ECS/Fargate)")
    .option("--profile <profile>", "AWS CLI profile to use")
    .option("--region <region>", "AWS region")
    .option("--environment <env>", "Environment name (e.g., production)")
    .option("-y, --yes", "Non-interactive mode with defaults")
    .action(runAwsSetup);

  program
    .command("setup-terraform")
    .description("Generate Terraform files for AWS deployment")
    .option("--output-dir <dir>", "Output directory for Terraform files")
    .option("--environment <env>", "Environment name (e.g., production)")
    .option("--region <region>", "AWS region")
    .option(
      "--base-url <url>",
      "Public base URL (e.g., https://app.example.com)",
    )
    .option("--domain-name <domain>", "Domain name for DNS/HTTPS")
    .option("--acm-certificate-arn <arn>", "ACM certificate ARN for HTTPS")
    .option("--route53-zone-id <id>", "Route53 hosted zone ID for DNS")
    .option("--rds-instance-class <class>", "RDS instance class")
    .option("--enable-redis", "Provision ElastiCache Redis")
    .option("--redis-instance-class <class>", "Redis instance class")
    .option("--llm-provider <provider>", "Default LLM provider")
    .option("--llm-model <model>", "Default LLM model")
    .option("--google-client-id <id>", "Google OAuth client ID")
    .option("--google-client-secret <secret>", "Google OAuth client secret")
    .option("--google-pubsub-topic-name <name>", "Google Pub/Sub topic name")
    .option("--anthropic-api-key <key>", "Anthropic API key")
    .option("--openai-api-key <key>", "OpenAI API key")
    .option("--google-api-key <key>", "Google Gemini API key")
    .option("--openrouter-api-key <key>", "OpenRouter API key")
    .option("--groq-api-key <key>", "Groq API key")
    .option("--ai-gateway-api-key <key>", "AI Gateway API key")
    .option("--bedrock-access-key <key>", "AWS access key for Bedrock")
    .option("--bedrock-secret-key <key>", "AWS secret key for Bedrock")
    .option("--bedrock-region <region>", "AWS region for Bedrock")
    .option("--ollama-base-url <url>", "Ollama base URL")
    .option("--ollama-model <model>", "Ollama model name")
    .option("--microsoft-client-id <id>", "Microsoft OAuth client ID")
    .option(
      "--microsoft-client-secret <secret>",
      "Microsoft OAuth client secret",
    )
    .option("-y, --yes", "Non-interactive mode with defaults")
    .action(runTerraformSetup);

  // Default to help if no command
  if (process.argv.length === 2) {
    program.help();
  }

  await program.parseAsync();
}

function stripSetupAwsDoubleDash(argv: string[]) {
  const commandIndex = argv.indexOf("setup-aws");
  if (commandIndex === -1) return;
  const dashIndex = argv.indexOf("--", commandIndex + 1);
  if (dashIndex !== -1) {
    argv.splice(dashIndex, 1);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Setup Command
// ═══════════════════════════════════════════════════════════════════════════

async function runSetup(options: { name?: string }) {
  p.intro("Inbox Zero Setup");

  const mode = await p.select({
    message: "How would you like to set up?",
    options: [
      {
        value: "quick",
        label: "Quick setup",
        hint: "just the essentials, we handle the rest",
      },
      {
        value: "custom",
        label: "Custom setup",
        hint: "configure infrastructure, providers, and more",
      },
    ],
  });

  if (p.isCancel(mode)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (mode === "custom") {
    return runSetupAdvanced(options);
  }
  return runSetupQuick(options);
}

// ═══════════════════════════════════════════════════════════════════════════
// Quick Setup (minimal questions)
// ═══════════════════════════════════════════════════════════════════════════

async function runSetupQuick(options: { name?: string }) {
  const configName = options.name;

  requireDocker();

  p.note(
    "Choose the email provider(s) you want to enable now.\n" +
      "You can add or change providers later with: inbox-zero config",
    "Step 1: OAuth Providers",
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

  let googleClientId = "";
  let googleClientSecret = "";
  if (wantsGoogle) {
    const callbackUrl = "http://localhost:3000/api/auth/callback/google";
    const linkingCallbackUrl =
      "http://localhost:3000/api/google/linking/callback";

    p.note(
      "You need a Google OAuth app to connect your Gmail.\n\n" +
        "First, set up the OAuth consent screen:\n" +
        "1. Open: https://console.cloud.google.com/apis/credentials/consent\n" +
        "2. User type:\n" +
        '   - "Internal" — Google Workspace only, all org members can sign in\n' +
        '   - "External" — works with any Google account (including personal Gmail)\n' +
        "     You'll need to add yourself as a test user (step 5)\n" +
        "3. Fill in the app name and your email\n" +
        '4. Click "Save and Continue" through the scopes section\n' +
        "5. If External: add your email as a test user\n" +
        "6. Complete the wizard\n\n" +
        "Then, create OAuth credentials:\n" +
        "7. Open: https://console.cloud.google.com/apis/credentials\n" +
        `8. Click "Create Credentials" → "OAuth client ID"\n` +
        `9. Select "Web application"\n` +
        `10. Under "Authorized redirect URIs" add:\n` +
        `    ${callbackUrl}\n` +
        `    ${linkingCallbackUrl}\n` +
        "11. Copy the Client ID and Client Secret\n\n" +
        "If External: you'll see a \"This app isn't verified\" warning when\n" +
        'signing in. Click "Advanced" then "Go to [app name]" to proceed.\n\n' +
        "Full guide: https://docs.getinboxzero.com/hosting/setup-guides",
      "Google OAuth",
    );

    const googleClientIdResult = await p.text({
      message: "Google Client ID",
      placeholder: "paste your Client ID here",
    });
    if (p.isCancel(googleClientIdResult)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    googleClientId = googleClientIdResult;

    const googleClientSecretResult = await p.text({
      message: "Google Client Secret",
      placeholder: "paste your Client Secret here",
    });
    if (p.isCancel(googleClientSecretResult)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    googleClientSecret = googleClientSecretResult;
  }

  let microsoftClientId = "";
  let microsoftClientSecret = "";
  let microsoftTenantId = "common";
  if (wantsMicrosoft) {
    const microsoftCallbackUrl =
      "http://localhost:3000/api/auth/callback/microsoft";
    const microsoftLinkingCallbackUrl =
      "http://localhost:3000/api/outlook/linking/callback";
    const microsoftCalendarCallbackUrl =
      "http://localhost:3000/api/outlook/calendar/callback";

    p.note(
      "You need a Microsoft app registration to connect Outlook.\n\n" +
        "1. Open: https://portal.azure.com/\n" +
        "2. Go to App registrations → New registration\n" +
        '3. Set account type to "Accounts in any organizational directory and personal Microsoft accounts"\n' +
        "4. Add redirect URIs:\n" +
        `   ${microsoftCallbackUrl}\n` +
        `   ${microsoftLinkingCallbackUrl}\n` +
        `   ${microsoftCalendarCallbackUrl}\n` +
        "5. Go to Certificates & secrets → New client secret\n" +
        "6. Copy Application (client) ID and secret value\n\n" +
        'Tenant ID tip: use "common" for most setups.\n' +
        "Use a specific tenant ID only if your organization requires\n" +
        "single-tenant sign-in.\n\n" +
        "Full guide: https://docs.getinboxzero.com/hosting/setup-guides#microsoft-oauth-setup",
      "Microsoft OAuth",
    );

    const microsoftOAuth = await p.group(
      {
        clientId: () =>
          p.text({
            message: "Microsoft Client ID",
            placeholder: "paste your Client ID here",
          }),
        clientSecret: () =>
          p.text({
            message: "Microsoft Client Secret",
            placeholder: "paste your Client Secret here",
          }),
        tenantId: () =>
          p.text({
            message:
              'Microsoft Tenant ID (default: "common"; use specific tenant for single-tenant orgs)',
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

    microsoftClientId = microsoftOAuth.clientId || "";
    microsoftClientSecret = microsoftOAuth.clientSecret || "";
    microsoftTenantId = microsoftOAuth.tenantId || "common";
  }

  // ── AI Provider ──

  p.note(
    "Choose which AI service will process your emails.",
    "AI Provider",
  );

  const llmProvider = await p.select({
    message: "AI Provider",
    options: LLM_PROVIDER_OPTIONS,
  });
  if (p.isCancel(llmProvider)) cancelSetup();

  // Gather LLM credentials before generating config
  const llmEnv: EnvConfig = { DEFAULT_LLM_PROVIDER: llmProvider };
  await promptLlmCredentials(llmProvider, llmEnv);

  // Generate token early so we can show it in the instructions
  const pubsubVerificationToken = generateSecret(32);
  let pubsubTopic = "";

  if (wantsGoogle) {
    p.note(
      "Google Pub/Sub enables real-time email notifications.\n\n" +
        "1. Go to: https://console.cloud.google.com/cloudpubsub/topic/list\n" +
        '2. Create a topic (e.g., "inbox-zero-emails")\n' +
        "3. Grant Gmail publish access to your topic:\n" +
        "   - Add principal: gmail-api-push@system.gserviceaccount.com\n" +
        '   - Role: "Pub/Sub Publisher"\n' +
        "4. Create a push subscription using this endpoint:\n" +
        `   https://yourdomain.com/api/google/webhook?token=${pubsubVerificationToken}\n` +
        "5. Paste the topic name below (or press Enter to skip for now)\n\n" +
        "Full guide: https://docs.getinboxzero.com/hosting/setup-guides#google-pubsub-setup",
      "Google Pub/Sub (optional)",
    );

    const pubsubTopicResult = await p.text({
      message: "Google Pub/Sub Topic Name",
      placeholder: "projects/your-project-id/topics/inbox-zero-emails",
      validate: (v) => {
        if (!v) return undefined;
        if (!v.startsWith("projects/") || !v.includes("/topics/")) {
          return "Topic name must be in format: projects/PROJECT_ID/topics/TOPIC_NAME";
        }
        return undefined;
      },
    });

    if (p.isCancel(pubsubTopicResult)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }
    pubsubTopic = pubsubTopicResult;
  }

  // ── Generate config ──

  // Determine file paths first so we can read existing config
  const configDir = REPO_ROOT ?? STANDALONE_CONFIG_DIR;
  const envFileName = configName ? `.env.${configName}` : ".env";
  const envFile = REPO_ROOT
    ? resolve(REPO_ROOT, "apps/web", envFileName)
    : resolve(STANDALONE_CONFIG_DIR, envFileName);
  const composeFile = REPO_ROOT
    ? resolve(REPO_ROOT, "docker-compose.yml")
    : STANDALONE_COMPOSE_FILE;

  ensureConfigDir(configDir);

  // Check if already configured
  if (existsSync(envFile)) {
    const overwrite = await p.confirm({
      message: "Existing configuration found. Overwrite it?",
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Setup cancelled. Existing configuration preserved.");
      process.exit(0);
    }
  }

  const spinner = p.spinner();
  spinner.start("Generating configuration...");

  // Reuse existing database password to avoid mismatch with Docker volume
  const existingDbPassword = readExistingDbPassword(envFile);

  const redisToken = generateSecret(32);
  const dbPassword = existingDbPassword || generateSecret(16);
  const env: EnvConfig = {
    NODE_ENV: "production",
    // Database (Docker internal networking)
    POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: dbPassword,
    POSTGRES_DB: "inboxzero",
    DATABASE_URL: `postgresql://postgres:${dbPassword}@db:5432/inboxzero`,
    UPSTASH_REDIS_TOKEN: redisToken,
    UPSTASH_REDIS_URL: "http://serverless-redis-http:80",
    INTERNAL_API_URL: "http://web:3000",
    // Secrets
    AUTH_SECRET: generateSecret(32),
    EMAIL_ENCRYPT_SECRET: generateSecret(32),
    EMAIL_ENCRYPT_SALT: generateSecret(16),
    INTERNAL_API_KEY: generateSecret(32),
    API_KEY_SALT: generateSecret(32),
    CRON_SECRET: generateSecret(32),
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: pubsubVerificationToken,
    // Google OAuth
    GOOGLE_CLIENT_ID: wantsGoogle
      ? googleClientId || "your-google-client-id"
      : "skipped",
    GOOGLE_CLIENT_SECRET: wantsGoogle
      ? googleClientSecret || "your-google-client-secret"
      : "skipped",
    GOOGLE_PUBSUB_TOPIC_NAME:
      pubsubTopic || "projects/your-project-id/topics/inbox-zero-emails",
    // Microsoft OAuth
    MICROSOFT_CLIENT_ID: wantsMicrosoft
      ? microsoftClientId || "your-microsoft-client-id"
      : undefined,
    MICROSOFT_CLIENT_SECRET: wantsMicrosoft
      ? microsoftClientSecret || "your-microsoft-client-secret"
      : undefined,
    MICROSOFT_TENANT_ID: wantsMicrosoft ? microsoftTenantId : undefined,
    MICROSOFT_WEBHOOK_CLIENT_STATE: wantsMicrosoft
      ? generateSecret(32)
      : undefined,
    // LLM
    ...llmEnv,
    // App
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: "true",
  };

  env.DIRECT_URL = env.DATABASE_URL;

  // Fetch docker-compose.yml if not in the repo
  if (!REPO_ROOT) {
    try {
      let composeContent = await fetchDockerCompose();
      composeContent = fixComposeEnvPaths(composeContent);
      writeFileSync(composeFile, composeContent);
    } catch {
      spinner.stop("Failed to download Docker setup");
      p.log.error(
        "Could not fetch docker-compose.yml from GitHub.\n" +
          "Please check your internet connection and try again.",
      );
      process.exit(1);
    }
  }

  // Write .env from template
  let template: string;
  try {
    template = await getEnvTemplate();
  } catch {
    spinner.stop("Failed to fetch configuration template");
    p.log.error("Could not fetch .env.example template.");
    process.exit(1);
  }

  const envContent = generateEnvFile({
    env,
    useDockerInfra: true,
    llmProvider,
    template,
  });
  writeFileSync(envFile, envContent);

  spinner.stop("Configuration ready");

  // ── Step 3: Start ──

  p.note(
    `Environment file: ${envFile}\nDocker Compose: ${composeFile}`,
    "Files created",
  );

  const shouldStart = await p.confirm({
    message: "Start Inbox Zero now?",
    initialValue: true,
  });

  if (p.isCancel(shouldStart) || !shouldStart) {
    p.note(
      "Start later with:\n  inbox-zero start\n\n" +
        "Update settings with:\n  inbox-zero config",
      "Next steps",
    );
    p.outro("Setup complete!");
    return;
  }

  // Check if already running
  const composeArgs = REPO_ROOT ? ["compose"] : ["compose", "-f", composeFile];

  if (checkContainersRunning(composeArgs)) {
    const restart = await p.confirm({
      message: "Inbox Zero is already running. Restart?",
      initialValue: true,
    });
    if (p.isCancel(restart) || !restart) {
      p.note(
        "Inbox Zero is still running at http://localhost:3000",
        "Already running",
      );
      p.outro("Setup complete!");
      return;
    }
    const stopSpinner = p.spinner();
    stopSpinner.start("Stopping existing containers...");
    await runDockerCommand([...composeArgs, "down"]);
    stopSpinner.stop("Stopped");
  }

  // Pull and start
  const pullSpinner = p.spinner();
  pullSpinner.start("Pulling Docker images (this may take a minute)...");

  const pullResult = await runDockerCommand([...composeArgs, "pull"]);

  if (pullResult.status !== 0) {
    pullSpinner.stop("Failed to pull images");
    p.log.error(pullResult.stderr || "Unknown error");
    p.log.info("You can try again later with: inbox-zero start");
    process.exit(1);
  }

  pullSpinner.stop("Images pulled");

  const startSpinner = p.spinner();
  startSpinner.start("Starting Inbox Zero...");

  const upResult = await runDockerCommand([
    ...composeArgs,
    "--profile",
    "all",
    "up",
    "-d",
  ]);

  if (upResult.status !== 0) {
    const portError = parsePortConflict(upResult.stderr);
    startSpinner.stop("Failed to start");
    if (portError) {
      p.log.error(portError);
      p.log.info(
        "Stop the conflicting process or update the port mapping\n" +
          "in your .env file and docker-compose.yml, then retry.",
      );
    } else {
      p.log.error(upResult.stderr || "Unknown error");
    }
    p.log.info("You can try again with: inbox-zero start");
    process.exit(1);
  }

  startSpinner.stop("Inbox Zero is running!");

  p.note(
    "Open http://localhost:3000 to get started.\n\n" +
      "Useful commands:\n" +
      "  inbox-zero config    — update settings (e.g. add Pub/Sub token)\n" +
      "  inbox-zero logs -f   — view live logs\n" +
      "  inbox-zero stop      — stop the app\n" +
      "  inbox-zero update    — update to latest version",
    "You're all set!",
  );

  p.outro("Inbox Zero is ready!");
}

// ═══════════════════════════════════════════════════════════════════════════
// Advanced Setup (full options)
// ═══════════════════════════════════════════════════════════════════════════

async function runSetupAdvanced(options: { name?: string }) {
  const configName = options.name;
  p.intro(`🚀 Inbox Zero Setup${configName ? ` (${configName})` : ""}`);

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
  p.note(
    "Recommended for first-time self-hosting: use Docker Compose for Postgres/Redis.\n" +
      "Then run everything in Docker unless you plan to run the web app from this repo with pnpm.",
    "Infrastructure Recommendation",
  );

  const infraChoice = await p.select({
    message: "How do you want to run PostgreSQL and Redis?",
    options: [
      {
        value: "docker",
        label: "Docker Compose",
        hint: "recommended for most self-hosted setups",
      },
      {
        value: "external",
        label: "External / Bring your own",
        hint: "use existing managed Postgres + Redis",
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
    if (!REPO_ROOT) {
      runWebInDocker = true;
      p.note(
        "You're running setup outside the source repo, so the web app will run in Docker.\n" +
          "If you want to run Next.js with pnpm, clone the repo and run setup there.",
        "Web Runtime",
      );
    } else {
      const fullStackDocker = await p.select({
        message: "Do you want to run the full stack in Docker?",
        options: [
          {
            value: "yes",
            label: "Yes, everything in Docker",
            hint: "recommended for production: docker compose --profile all",
          },
          {
            value: "no",
            label: "No, just database & Redis",
            hint: "run Next.js separately with pnpm (repo mode only)",
          },
        ],
      });

      if (p.isCancel(fullStackDocker)) {
        p.cancel("Setup cancelled.");
        process.exit(0);
      }

      runWebInDocker = fullStackDocker === "yes";
    }
  }

  if (useDockerInfra) {
    requireDocker();
  }

  // Determine paths - if in repo, write to apps/web/.env, otherwise use standalone
  const configDir = REPO_ROOT ?? STANDALONE_CONFIG_DIR;
  const envFileName = configName ? `.env.${configName}` : ".env";
  const envFile = REPO_ROOT
    ? resolve(REPO_ROOT, "apps/web", envFileName)
    : resolve(STANDALONE_CONFIG_DIR, envFileName);
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

    // Google Pub/Sub setup for real-time email notifications
    p.note(
      `To receive real-time email notifications, you need to set up Google Pub/Sub:

1. Go to Google Cloud Console: https://console.cloud.google.com/cloudpubsub/topic/list
2. Create a new topic (e.g., "inbox-zero-emails")
3. Add the Gmail API service account as a publisher:
   - Click on the topic → Permissions → Add Principal
   - Add: gmail-api-push@system.gserviceaccount.com
   - Role: Pub/Sub Publisher
4. Create a push subscription pointing to your webhook URL:
   - Endpoint: https://yourdomain.com/api/google/webhook
5. Copy the full topic name (e.g., projects/my-project-123/topics/inbox-zero-emails)

Full guide: https://docs.getinboxzero.com/self-hosting/google-pubsub`,
      "Google Pub/Sub Setup (Required for Gmail)",
    );

    const pubsubTopic = await p.text({
      message: "Google Pub/Sub Topic Name",
      placeholder: "projects/your-project-id/topics/inbox-zero-emails",
      validate: (v) => {
        if (!v) return undefined; // Allow empty to skip
        if (!v.startsWith("projects/") || !v.includes("/topics/")) {
          return "Topic name must be in format: projects/PROJECT_ID/topics/TOPIC_NAME";
        }
        return undefined;
      },
    });

    if (p.isCancel(pubsubTopic)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    env.GOOGLE_PUBSUB_TOPIC_NAME =
      pubsubTopic || "projects/your-project-id/topics/inbox-zero-emails";
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
    options: LLM_PROVIDER_OPTIONS,
  });
  if (p.isCancel(llmProvider)) cancelSetup();

  env.DEFAULT_LLM_PROVIDER = llmProvider;
  await promptLlmCredentials(llmProvider, env);

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
    env.POSTGRES_PASSWORD =
      readExistingDbPassword(envFile) ||
      (isDevMode ? "password" : generateSecret(16));
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
  // Google PubSub topic - only set placeholder if not already configured during Google OAuth setup
  if (!env.GOOGLE_PUBSUB_TOPIC_NAME) {
    env.GOOGLE_PUBSUB_TOPIC_NAME =
      "projects/your-project-id/topics/inbox-zero-emails";
  }

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
      composeContent = fixComposeEnvPaths(composeContent);
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
NEXT_PUBLIC_BASE_URL=https://yourdomain.com ${composeCmd} --profile all up -d

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
  requireDocker();

  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error(
      "Inbox Zero is not configured for production mode.\n" +
        "Run 'inbox-zero setup' and choose Production (Docker) first.",
    );
    process.exit(1);
  }

  p.intro("🚀 Starting Inbox Zero");

  const composeArgs = ["compose", "-f", STANDALONE_COMPOSE_FILE];

  if (checkContainersRunning(composeArgs)) {
    const restart = await p.confirm({
      message: "Inbox Zero is already running. Restart?",
      initialValue: true,
    });
    if (p.isCancel(restart) || !restart) {
      p.outro("Inbox Zero is already running.");
      return;
    }
    const stopSpinner = p.spinner();
    stopSpinner.start("Stopping existing containers...");
    await runDockerCommand([...composeArgs, "down"]);
    stopSpinner.stop("Stopped");
  }

  const spinner = p.spinner();
  spinner.start("Pulling latest image...");

  const pullResult = await runDockerCommand([...composeArgs, "pull"]);

  if (pullResult.status !== 0) {
    spinner.stop("Failed to pull image");
    p.log.error(pullResult.stderr || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Image pulled");

  if (options.detach) {
    spinner.start("Starting containers...");

    const upResult = await runDockerCommand([
      ...composeArgs,
      "--profile",
      "all",
      "up",
      "-d",
    ]);

    if (upResult.status !== 0) {
      const portError = parsePortConflict(upResult.stderr);
      spinner.stop("Failed to start");
      if (portError) {
        p.log.error(portError);
        p.log.info(
          "Stop the conflicting process or change the port:\n" +
            "  inbox-zero config set WEB_PORT <port>\n" +
            "  inbox-zero config set POSTGRES_PORT <port>\n" +
            "  inbox-zero config set REDIS_PORT <port>",
        );
      } else {
        p.log.error(upResult.stderr || "Unknown error");
      }
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
  } else {
    p.log.info("Starting containers in foreground...");

    const child = spawn("docker", [...composeArgs, "--profile", "all", "up"], {
      stdio: "inherit",
    });
    const code = await new Promise<number | null>((resolve) => {
      child.on("close", (c) => resolve(c));
    });
    if (code !== 0) {
      process.exit(code ?? 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Stop Command
// ═══════════════════════════════════════════════════════════════════════════

async function runStop() {
  requireDocker();

  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  p.intro("Stopping Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Stopping containers...");

  const result = await runDockerCommand([
    "compose",
    "-f",
    STANDALONE_COMPOSE_FILE,
    "down",
  ]);

  if (result.status !== 0) {
    spinner.stop("Failed to stop");
    p.log.error(result.stderr || "Unknown error");
    process.exit(1);
  }

  spinner.stop("Containers stopped");
  p.outro("Inbox Zero stopped");
}

// ═══════════════════════════════════════════════════════════════════════════
// Logs Command
// ═══════════════════════════════════════════════════════════════════════════

async function runLogs(options: { follow: boolean; tail: string }) {
  requireDocker();

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
  requireDocker();

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
  requireDocker();

  if (!existsSync(STANDALONE_COMPOSE_FILE)) {
    p.log.error("Inbox Zero is not configured.");
    process.exit(1);
  }

  p.intro("Updating Inbox Zero");

  const spinner = p.spinner();
  spinner.start("Pulling latest image...");

  const pullResult = await runDockerCommand([
    "compose",
    "-f",
    STANDALONE_COMPOSE_FILE,
    "pull",
  ]);

  if (pullResult.status !== 0) {
    spinner.stop("Failed to pull");
    p.log.error(pullResult.stderr || "Unknown error");
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

    await runDockerCommand(["compose", "-f", STANDALONE_COMPOSE_FILE, "down"]);
    const upResult = await runDockerCommand([
      "compose",
      "-f",
      STANDALONE_COMPOSE_FILE,
      "--profile",
      "all",
      "up",
      "-d",
    ]);

    if (upResult.status !== 0) {
      const portError = parsePortConflict(upResult.stderr);
      spinner.stop("Failed to restart");
      if (portError) {
        p.log.error(portError);
        p.log.info(
          "Stop the conflicting process or change the port:\n" +
            "  inbox-zero config set WEB_PORT <port>\n" +
            "  inbox-zero config set POSTGRES_PORT <port>\n" +
            "  inbox-zero config set REDIS_PORT <port>",
        );
      } else {
        p.log.error(upResult.stderr || "Unknown error");
      }
      process.exit(1);
    }

    spinner.stop("Restarted");
  }

  p.outro("Update complete! 🎉");
}

// ═══════════════════════════════════════════════════════════════════════════
// Config Command
// ═══════════════════════════════════════════════════════════════════════════

const CONFIG_CATEGORIES: Record<
  string,
  { description: string; keys: string[] }
> = {
  "Google (OAuth & Pub/Sub)": {
    description: "Gmail integration and real-time notifications",
    keys: [
      "GOOGLE_CLIENT_ID",
      "GOOGLE_CLIENT_SECRET",
      "GOOGLE_PUBSUB_TOPIC_NAME",
      "GOOGLE_PUBSUB_VERIFICATION_TOKEN",
    ],
  },
  "Microsoft (OAuth)": {
    description: "Outlook / Microsoft 365 integration",
    keys: [
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_CLIENT_SECRET",
      "MICROSOFT_TENANT_ID",
    ],
  },
  "AI Provider": {
    description: "LLM provider and API keys",
    keys: [
      "DEFAULT_LLM_PROVIDER",
      "DEFAULT_LLM_MODEL",
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GOOGLE_API_KEY",
      "OPENROUTER_API_KEY",
      "AI_GATEWAY_API_KEY",
      "GROQ_API_KEY",
      "BEDROCK_ACCESS_KEY",
      "BEDROCK_SECRET_KEY",
      "BEDROCK_REGION",
    ],
  },
  "Database & Redis": {
    description: "Database and cache connections",
    keys: [
      "DATABASE_URL",
      "DIRECT_URL",
      "UPSTASH_REDIS_URL",
      "UPSTASH_REDIS_TOKEN",
    ],
  },
  "App Settings": {
    description: "Application URL and feature flags",
    keys: ["NEXT_PUBLIC_BASE_URL", "NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS"],
  },
};

function requireEnvFile(name?: string): { envFile: string; content: string } {
  const envFile = findEnvFile(name);
  if (!envFile) {
    const suffix = name ? ` (${name})` : "";
    p.log.error(
      `No .env file found${suffix}.\nRun 'inbox-zero setup' first to create one.`,
    );
    process.exit(1);
  }
  return { envFile, content: readFileSync(envFile, "utf-8") };
}

async function runConfigInteractive(name?: string) {
  p.intro("Inbox Zero Configuration");

  const { envFile, content } = requireEnvFile(name);
  const env = parseEnvFile(content);

  const category = await p.select({
    message: "What would you like to configure?",
    options: Object.entries(CONFIG_CATEGORIES).map(
      ([name, { description }]) => ({
        value: name,
        label: name,
        hint: description,
      }),
    ),
  });

  if (p.isCancel(category)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const { keys } = CONFIG_CATEGORIES[category];

  const currentValues = keys
    .map((key) => {
      const value = env[key];
      const display = value ? redactValue(key, value) : "(not set)";
      return `  ${key} = ${display}`;
    })
    .join("\n");

  p.note(currentValues, `Current ${category} settings`);

  const keyToUpdate = await p.select({
    message: "Which setting to update?",
    options: keys.map((key) => ({
      value: key,
      label: key,
      hint: env[key] ? redactValue(key, env[key]) : "(not set)",
    })),
  });

  if (p.isCancel(keyToUpdate)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  const currentValue = env[keyToUpdate];
  const newValue = await p.text({
    message: `New value for ${keyToUpdate}`,
    placeholder: currentValue || "enter value",
    initialValue: isSensitiveKey(keyToUpdate) ? "" : currentValue || "",
  });

  if (p.isCancel(newValue)) {
    p.cancel("Cancelled.");
    process.exit(0);
  }

  if (!newValue) {
    p.log.warn("No value entered. Nothing changed.");
    process.exit(0);
  }

  const updated = updateEnvValue(content, keyToUpdate, newValue);
  writeFileSync(envFile, updated);

  p.log.success(`Updated ${keyToUpdate}`);
  p.note(
    "If containers are running, restart for changes to take effect:\n  inbox-zero stop && inbox-zero start",
    "Next step",
  );
  p.outro("Done!");
}

const VALID_CONFIG_KEYS = new Set(
  Object.values(CONFIG_CATEGORIES).flatMap((c) => c.keys),
);

async function runConfigSet(key: string, value: string, name?: string) {
  if (!VALID_CONFIG_KEYS.has(key)) {
    p.log.error(`Unknown key: ${key}`);
    p.log.info(
      `Valid keys:\n${[...VALID_CONFIG_KEYS].map((k) => `  ${k}`).join("\n")}`,
    );
    process.exit(1);
  }
  const { envFile, content } = requireEnvFile(name);
  const updated = updateEnvValue(content, key, value);
  writeFileSync(envFile, updated);
  p.log.success(`Set ${key}`);
}

async function runConfigGet(key: string, name?: string) {
  const { content } = requireEnvFile(name);
  const env = parseEnvFile(content);
  const value = env[key];
  if (value === undefined) {
    p.log.warn(`${key} is not set`);
  } else {
    p.log.info(`${key} = ${redactValue(key, value)}`);
  }
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
// LLM Provider Helpers
// ═══════════════════════════════════════════════════════════════════════════

const LLM_PROVIDER_OPTIONS = [
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "openai", label: "OpenAI (ChatGPT)" },
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
  { value: "groq", label: "Groq" },
  { value: "ollama", label: "Ollama", hint: "self-hosted" },
];

const LLM_LINKS: Record<string, string> = {
  anthropic: "https://console.anthropic.com/settings/keys",
  openai: "https://platform.openai.com/api-keys",
  google: "https://aistudio.google.com/apikey",
  openrouter: "https://openrouter.ai/settings/keys",
  aigateway: "https://vercel.com/docs/ai-gateway",
  groq: "https://console.groq.com/keys",
};

const DEFAULT_MODELS: Record<string, { default: string; economy: string }> = {
  anthropic: {
    default: "claude-sonnet-4-5-20250929",
    economy: "claude-haiku-4-5-20251001",
  },
  openai: { default: "gpt-5.1", economy: "gpt-5.1-mini" },
  google: { default: "gemini-3-flash", economy: "gemini-2-5-flash" },
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

const API_KEY_ENV_VAR: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  aigateway: "AI_GATEWAY_API_KEY",
  groq: "GROQ_API_KEY",
};

function cancelSetup(): never {
  p.cancel("Setup cancelled.");
  process.exit(0);
}

async function promptOllamaCreds(): Promise<{
  baseUrl: string;
  model: string;
}> {
  const creds = await p.group(
    {
      baseUrl: () =>
        p.text({
          message: "Ollama Base URL",
          placeholder: "http://localhost:11434",
          initialValue: "http://localhost:11434",
        }),
      model: () =>
        p.text({
          message: "Ollama Model",
          placeholder: "llama3.1",
          validate: (v) => (!v ? "Model name is required" : undefined),
        }),
    },
    { onCancel: cancelSetup },
  );
  return {
    baseUrl: creds.baseUrl || "http://localhost:11434",
    model: creds.model,
  };
}

async function promptBedrockCreds(): Promise<{
  accessKey: string;
  secretKey: string;
  region: string;
}> {
  p.log.info(
    "Get your AWS credentials from the AWS Console:\nhttps://console.aws.amazon.com/iam/",
  );
  const creds = await p.group(
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
    { onCancel: cancelSetup },
  );
  return {
    accessKey: creds.accessKey,
    secretKey: creds.secretKey,
    region: creds.region || "us-west-2",
  };
}

async function promptApiKey(provider: string): Promise<string> {
  p.log.info(`Get your API key at:\n${LLM_LINKS[provider]}`);
  const apiKey = await p.text({
    message: `${provider.charAt(0).toUpperCase() + provider.slice(1)} API Key`,
    placeholder: "paste your API key here",
    validate: (v) => (!v ? "API key is required" : undefined),
  });
  if (p.isCancel(apiKey)) cancelSetup();
  return apiKey;
}

async function promptLlmCredentials(
  provider: string,
  env: EnvConfig,
): Promise<void> {
  if (provider === "ollama") {
    const ollama = await promptOllamaCreds();
    env.OLLAMA_BASE_URL = ollama.baseUrl;
    env.OLLAMA_MODEL = ollama.model;
    env.DEFAULT_LLM_MODEL = ollama.model;
    env.ECONOMY_LLM_PROVIDER = provider;
    env.ECONOMY_LLM_MODEL = ollama.model;
  } else {
    env.DEFAULT_LLM_MODEL = DEFAULT_MODELS[provider].default;
    env.ECONOMY_LLM_PROVIDER = provider;
    env.ECONOMY_LLM_MODEL = DEFAULT_MODELS[provider].economy;

    if (provider === "bedrock") {
      const bedrock = await promptBedrockCreds();
      env.BEDROCK_ACCESS_KEY = bedrock.accessKey;
      env.BEDROCK_SECRET_KEY = bedrock.secretKey;
      env.BEDROCK_REGION = bedrock.region;
    } else {
      env[API_KEY_ENV_VAR[provider]] = await promptApiKey(provider);
    }
  }
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

// ═══════════════════════════════════════════════════════════════════════════
// Docker Command Helpers
// ═══════════════════════════════════════════════════════════════════════════

function runDockerCommand(
  args: string[],
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { stdio: "pipe" });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("close", (code) => {
      resolve({
        status: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString(),
        stderr: Buffer.concat(stderrChunks).toString(),
      });
    });

    child.on("error", (err) => {
      resolve({ status: 1, stdout: "", stderr: err.message });
    });
  });
}

function readExistingDbPassword(envFile: string): string | undefined {
  if (!existsSync(envFile)) return undefined;
  const existing = parseEnvFile(readFileSync(envFile, "utf-8"));
  return existing.POSTGRES_PASSWORD || undefined;
}

function checkContainersRunning(composeArgs: string[]): boolean {
  const result = spawnSync("docker", [...composeArgs, "ps", "-q"], {
    stdio: "pipe",
  });
  if (result.status !== 0) return false;
  return (result.stdout?.toString().trim() ?? "") !== "";
}

// Only run main() when executed directly, not when imported for testing
const isMainModule =
  process.argv[1] &&
  (process.argv[1].endsWith("main.ts") ||
    process.argv[1].endsWith("inbox-zero.js") ||
    basename(process.argv[1]).startsWith("inbox-zero"));

if (isMainModule) {
  main().catch((error) => {
    p.log.error(String(error));
    process.exit(1);
  });
}
