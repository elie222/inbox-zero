#!/usr/bin/env bun

import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { program } from "commander";
import * as p from "@clack/prompts";

// Detect if we're in an inbox-zero project
function findProjectRoot(): string {
  const cwd = process.cwd();

  // Check if we're in project root (has apps/web directory)
  if (existsSync(resolve(cwd, "apps/web"))) {
    return cwd;
  }

  // Check if we're in apps/web
  if (existsSync(resolve(cwd, "../../apps/web"))) {
    return resolve(cwd, "../..");
  }

  // Default to cwd and let the user know
  return cwd;
}

const PROJECT_ROOT = findProjectRoot();
const ENV_FILE = resolve(PROJECT_ROOT, "apps/web/.env");

// Secret generation
function generateSecret(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

// Environment variable builder
type EnvConfig = Record<string, string | undefined>;

async function main() {
  program
    .name("inbox-zero")
    .description("CLI tool for setting up Inbox Zero")
    .version("2.21.15");

  program
    .command("setup")
    .description("Interactive setup for Inbox Zero environment")
    .action(runSetup);

  // Default to setup if no command provided
  if (process.argv.length === 2) {
    process.argv.push("setup");
  }

  await program.parseAsync();
}

async function runSetup() {
  p.intro("🚀 Inbox Zero Environment Setup");

  // Verify we're in an inbox-zero project
  if (!existsSync(resolve(PROJECT_ROOT, "apps/web"))) {
    p.log.error(
      "Could not find inbox-zero project.\n" +
        "Please run this command from the root of a cloned inbox-zero repository:\n\n" +
        "  git clone https://github.com/elie222/inbox-zero.git\n" +
        "  cd inbox-zero\n" +
        "  inbox-zero setup",
    );
    process.exit(1);
  }

  p.log.info(`Project root: ${PROJECT_ROOT}`);

  // Check if .env already exists
  if (existsSync(ENV_FILE)) {
    const overwrite = await p.confirm({
      message: ".env file already exists. Overwrite it?",
      initialValue: false,
    });

    if (p.isCancel(overwrite) || !overwrite) {
      p.cancel("Setup cancelled. Existing .env file preserved.");
      process.exit(0);
    }
  }

  const env: EnvConfig = {};

  // ═══════════════════════════════════════════════════════════════════════════
  // Environment
  // ═══════════════════════════════════════════════════════════════════════════

  const nodeEnv = await p.select({
    message: "Environment",
    options: [
      { value: "development", label: "Development", hint: "local development" },
      {
        value: "production",
        label: "Production",
        hint: "production deployment",
      },
    ],
  });

  if (p.isCancel(nodeEnv)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  env.NODE_ENV = nodeEnv;

  // ═══════════════════════════════════════════════════════════════════════════
  // OAuth Providers
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    "Choose which email providers to support.\nPress Enter to skip any field and add it to .env later.",
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
   - http://localhost:3000/api/auth/callback/google
   - http://localhost:3000/api/google/linking/callback
4. Copy Client ID and Client Secret

Full guide: https://github.com/elie222/inbox-zero#google-oauth-setup`,
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

    // Google PubSub (for real-time email notifications)
    p.note(
      `PubSub enables real-time email notifications from Gmail.

1. Create a topic: https://console.cloud.google.com/cloudpubsub/topic/list
2. Create a Push subscription with URL:
   https://yourdomain.com/api/google/webhook?token=YOUR_TOKEN
3. Grant publish rights to: gmail-api-push@system.gserviceaccount.com

Full guide: https://developers.google.com/gmail/api/guides/push`,
      "Google PubSub Configuration",
    );

    const pubsubTopic = await p.text({
      message: "Google PubSub Topic Name (press Enter to skip)",
      placeholder: "projects/my-project/topics/gmail",
    });

    if (p.isCancel(pubsubTopic)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    env.GOOGLE_PUBSUB_TOPIC_NAME =
      pubsubTopic || "projects/your-project/topics/gmail";
    env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = generateSecret(32);
  } else {
    // Microsoft only - add placeholder for required Google vars
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
   - http://localhost:3000/api/auth/callback/microsoft
   - http://localhost:3000/api/outlook/linking/callback
5. Go to Certificates & secrets → New client secret
6. Copy Application (client) ID and the secret Value

Full guide: https://github.com/elie222/inbox-zero#microsoft-oauth-setup`,
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
            message: "Microsoft Tenant ID (press Enter for 'common')",
            placeholder: "common",
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
  // Database
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    "Choose how to connect to PostgreSQL.\nDocker Compose includes a local PostgreSQL instance.",
    "Database Configuration",
  );

  const dbChoice = await p.select({
    message: "Database setup",
    options: [
      {
        value: "docker",
        label: "Use Docker Compose (local PostgreSQL)",
        hint: "recommended for local development",
      },
      {
        value: "custom",
        label: "Bring your own PostgreSQL",
        hint: "provide a connection string",
      },
    ],
  });

  if (p.isCancel(dbChoice)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (dbChoice === "docker") {
    env.DATABASE_URL =
      "postgresql://postgres:password@localhost:5432/inbox_zero";
  } else {
    const dbUrl = await p.text({
      message: "PostgreSQL connection string",
      placeholder: "postgresql://user:password@host:5432/database",
      validate: (v) => {
        if (!v) return "Connection string is required";
        if (!v.startsWith("postgresql://") && !v.startsWith("postgres://")) {
          return "Must be a valid PostgreSQL connection string";
        }
        return undefined;
      },
    });

    if (p.isCancel(dbUrl)) {
      p.cancel("Setup cancelled.");
      process.exit(0);
    }

    env.DATABASE_URL = dbUrl;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Redis
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    "Redis is used for rate limiting and caching.\nDocker Compose includes a local Redis instance.",
    "Redis Configuration",
  );

  const redisChoice = await p.select({
    message: "Redis setup",
    options: [
      {
        value: "docker",
        label: "Use Docker Compose (local Redis)",
        hint: "recommended for local development",
      },
      {
        value: "upstash",
        label: "Use Upstash Redis",
        hint: "serverless Redis",
      },
    ],
  });

  if (p.isCancel(redisChoice)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  const redisToken = generateSecret(32);

  if (redisChoice === "docker") {
    env.UPSTASH_REDIS_URL = "http://localhost:8079";
    env.UPSTASH_REDIS_TOKEN = redisToken;
    env.SRH_TOKEN = redisToken; // For local Redis HTTP adapter
  } else {
    const upstashConfig = await p.group(
      {
        url: () =>
          p.text({
            message: "Upstash Redis REST URL",
            placeholder: "https://xxxx.upstash.io",
            validate: (v) => (!v ? "Upstash URL is required" : undefined),
          }),
        token: () =>
          p.text({
            message: "Upstash Redis REST Token",
            placeholder: "AXxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            validate: (v) => (!v ? "Upstash token is required" : undefined),
          }),
      },
      {
        onCancel: () => {
          p.cancel("Setup cancelled.");
          process.exit(0);
        },
      },
    );

    env.UPSTASH_REDIS_URL = upstashConfig.url;
    env.UPSTASH_REDIS_TOKEN = upstashConfig.token;

    p.log.info(
      "Get Upstash credentials at:\nhttps://console.upstash.com/redis",
    );
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
      { value: "aigateway", label: "Vercel AI Gateway" },
    ],
  });

  if (p.isCancel(llmProvider)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  env.DEFAULT_LLM_PROVIDER = llmProvider;

  // Default models for each provider
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
    aigateway: {
      default: "anthropic/claude-sonnet-4.5",
      economy: "anthropic/claude-haiku-4.5",
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
    aigateway: "https://vercel.com/docs/ai-gateway",
  };

  const apiKeyEnvVar: Record<string, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_API_KEY",
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    aigateway: "AI_GATEWAY_API_KEY",
  };

  p.log.info(`Get your API key at:\n${llmLinks[llmProvider]}`);

  const apiKey = await p.text({
    message: `${llmProvider.charAt(0).toUpperCase() + llmProvider.slice(1)} API Key (press Enter to skip)`,
    placeholder: "sk-...",
  });

  if (p.isCancel(apiKey)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (apiKey) {
    env[apiKeyEnvVar[llmProvider]] = apiKey;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Tinybird (Optional)
  // ═══════════════════════════════════════════════════════════════════════════

  p.note(
    "Tinybird provides analytics for email statistics.\nGet credentials at: https://www.tinybird.co/",
    "Tinybird Analytics (Optional)",
  );

  const tinybirdToken = await p.text({
    message: "Tinybird Token - optional, press Enter to skip",
    placeholder: "p.xxxxx",
  });

  if (p.isCancel(tinybirdToken)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  if (tinybirdToken) {
    env.TINYBIRD_TOKEN = tinybirdToken;
    env.TINYBIRD_BASE_URL = "https://api.us-east.tinybird.co/";
    env.TINYBIRD_ENCRYPT_SECRET = generateSecret(32);
    env.TINYBIRD_ENCRYPT_SALT = generateSecret(16);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Base URL
  // ═══════════════════════════════════════════════════════════════════════════

  const baseUrl = await p.text({
    message: "Base URL for the app",
    placeholder: "http://localhost:3000",
    initialValue: "http://localhost:3000",
  });

  if (p.isCancel(baseUrl)) {
    p.cancel("Setup cancelled.");
    process.exit(0);
  }

  env.NEXT_PUBLIC_BASE_URL = baseUrl;

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-generated Secrets
  // ═══════════════════════════════════════════════════════════════════════════

  const spinner = p.spinner();
  spinner.start("Generating secrets...");

  env.AUTH_SECRET = generateSecret(32);
  env.EMAIL_ENCRYPT_SECRET = generateSecret(32);
  env.EMAIL_ENCRYPT_SALT = generateSecret(16);
  env.INTERNAL_API_KEY = generateSecret(32);
  env.API_KEY_SALT = generateSecret(32);
  env.CRON_SECRET = generateSecret(32);

  // Self-hosting recommended setting
  env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS = "true";

  spinner.stop("Secrets generated");

  // ═══════════════════════════════════════════════════════════════════════════
  // Write .env file
  // ═══════════════════════════════════════════════════════════════════════════

  spinner.start("Writing .env file...");

  const envContent = generateEnvFile(env);
  writeFileSync(ENV_FILE, envContent);

  spinner.stop(".env file created");

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  const configuredFeatures = [
    wantsGoogle ? "✓ Google OAuth" : "✗ Google OAuth (skipped)",
    wantsMicrosoft ? "✓ Microsoft OAuth" : "✗ Microsoft OAuth (skipped)",
    `✓ Database (${dbChoice === "docker" ? "Docker" : "custom"})`,
    `✓ Redis (${redisChoice === "docker" ? "Docker" : "Upstash"})`,
    `✓ LLM Provider (${llmProvider})`,
    wantsGoogle ? "✓ Google PubSub" : "✗ Google PubSub (not applicable)",
    tinybirdToken ? "✓ Tinybird Analytics" : "✗ Tinybird Analytics (skipped)",
    "✓ Auto-generated secrets",
  ].join("\n");

  p.note(configuredFeatures, "Configuration Summary");

  p.note(`Environment file saved to:\n${ENV_FILE}`, "Output");

  const useDocker = dbChoice === "docker" || redisChoice === "docker";

  if (useDocker) {
    p.note(
      "# Start with Docker Compose (includes database & Redis):\npnpm docker:up\n\n# Then run database migrations:\npnpm prisma:migrate:dev\n\n# Start the development server:\npnpm dev",
      "Next Steps",
    );
  } else {
    p.note(
      "# Run database migrations:\npnpm prisma:migrate:dev\n\n# Start the development server:\npnpm dev",
      "Next Steps",
    );
  }

  p.outro("Setup complete! 🎉");
}

function generateEnvFile(env: EnvConfig): string {
  const lines: string[] = [
    "# Inbox Zero Environment Configuration",
    "# Generated by setup-env CLI",
    `# ${new Date().toISOString()}`,
    "",
  ];

  // Helper to add a section
  // comment: true = always show as comment, false/undefined = show with value or empty
  const addSection = (
    title: string,
    vars: { name: string; comment?: boolean }[],
  ) => {
    const hasAnyNonComment = vars.some((v) => !v.comment);
    if (!hasAnyNonComment && vars.every((v) => env[v.name] === undefined))
      return;

    lines.push(
      "# ═══════════════════════════════════════════════════════════════",
    );
    lines.push(`# ${title}`);
    lines.push(
      "# ═══════════════════════════════════════════════════════════════",
    );

    for (const { name, comment } of vars) {
      const value = env[name];
      if (comment) {
        // Always show as comment
        lines.push(value !== undefined ? `# ${name}=${value}` : `# ${name}=`);
      } else {
        // Show with value or empty
        lines.push(`${name}=${value ?? ""}`);
      }
    }

    lines.push("");
  };

  // Core
  addSection("Core", [
    { name: "NODE_ENV" },
    { name: "DATABASE_URL" },
    { name: "NEXT_PUBLIC_BASE_URL" },
    { name: "NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS" },
  ]);

  // Authentication
  addSection("Authentication", [{ name: "AUTH_SECRET" }]);

  // Encryption
  addSection("Encryption", [
    { name: "EMAIL_ENCRYPT_SECRET" },
    { name: "EMAIL_ENCRYPT_SALT" },
  ]);

  // Google OAuth
  addSection("Google OAuth", [
    { name: "GOOGLE_CLIENT_ID" },
    { name: "GOOGLE_CLIENT_SECRET" },
  ]);

  // Microsoft OAuth
  addSection("Microsoft OAuth", [
    { name: "MICROSOFT_CLIENT_ID" },
    { name: "MICROSOFT_CLIENT_SECRET" },
    { name: "MICROSOFT_TENANT_ID" },
    { name: "MICROSOFT_WEBHOOK_CLIENT_STATE" },
  ]);

  // Google PubSub
  addSection("Google PubSub", [
    { name: "GOOGLE_PUBSUB_TOPIC_NAME" },
    { name: "GOOGLE_PUBSUB_VERIFICATION_TOKEN" },
  ]);

  // Redis
  addSection("Redis", [
    { name: "UPSTASH_REDIS_URL" },
    { name: "UPSTASH_REDIS_TOKEN" },
    { name: "SRH_TOKEN" },
    { name: "REDIS_URL", comment: true },
    { name: "QSTASH_TOKEN", comment: true },
    { name: "QSTASH_CURRENT_SIGNING_KEY", comment: true },
    { name: "QSTASH_NEXT_SIGNING_KEY", comment: true },
  ]);

  // LLM Provider
  addSection("LLM Provider", [
    { name: "DEFAULT_LLM_PROVIDER" },
    { name: "DEFAULT_LLM_MODEL" },
    { name: "ECONOMY_LLM_PROVIDER" },
    { name: "ECONOMY_LLM_MODEL" },
    { name: "ANTHROPIC_API_KEY" },
    { name: "OPENAI_API_KEY" },
    { name: "GOOGLE_API_KEY" },
    { name: "OPENROUTER_API_KEY" },
    { name: "GROQ_API_KEY" },
    { name: "AI_GATEWAY_API_KEY" },
  ]);

  // Tinybird Analytics
  addSection("Tinybird Analytics (Optional)", [
    { name: "TINYBIRD_TOKEN" },
    { name: "TINYBIRD_BASE_URL" },
    { name: "TINYBIRD_ENCRYPT_SECRET" },
    { name: "TINYBIRD_ENCRYPT_SALT" },
  ]);

  // Internal
  addSection("Internal", [
    { name: "INTERNAL_API_KEY" },
    { name: "API_KEY_SALT" },
    { name: "CRON_SECRET" },
  ]);

  // Optional Services (always show as comments)
  lines.push(
    "# ═══════════════════════════════════════════════════════════════",
  );
  lines.push("# Optional Services");
  lines.push(
    "# ═══════════════════════════════════════════════════════════════",
  );
  lines.push("");
  lines.push("# Sentry (error tracking)");
  lines.push("# SENTRY_AUTH_TOKEN=");
  lines.push("# SENTRY_ORGANIZATION=");
  lines.push("# SENTRY_PROJECT=");
  lines.push("# NEXT_PUBLIC_SENTRY_DSN=");
  lines.push("");
  lines.push("# Axiom (logging)");
  lines.push("# NEXT_PUBLIC_AXIOM_DATASET=");
  lines.push("# NEXT_PUBLIC_AXIOM_TOKEN=");
  lines.push("");
  lines.push("# Resend (transactional emails)");
  lines.push("# RESEND_API_KEY=");
  lines.push("");
  lines.push("# PostHog (analytics)");
  lines.push("# NEXT_PUBLIC_POSTHOG_KEY=");
  lines.push("# POSTHOG_API_SECRET=");
  lines.push("# POSTHOG_PROJECT_ID=");
  lines.push("");
  lines.push("# Debug");
  lines.push("# LOG_ZOD_ERRORS=true");
  lines.push("# ENABLE_DEBUG_LOGS=false");
  lines.push("");

  return lines.join("\n");
}

main().catch((error) => {
  p.log.error(String(error));
  process.exit(1);
});
