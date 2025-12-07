import { randomBytes } from "node:crypto";

// Environment variable builder
export type EnvConfig = Record<string, string | undefined>;

// Secret generation
export function generateSecret(bytes: number): string {
  return randomBytes(bytes).toString("hex");
}

export function generateEnvFile(config: {
  env: EnvConfig;
  useDockerInfra: boolean;
  llmProvider: string;
  template: string;
}): string {
  const { env, useDockerInfra, llmProvider, template } = config;

  let content = template;

  // Helper to wrap a value in quotes if defined (prevents "undefined" string bug)
  const wrapInQuotes = (value: string | undefined): string | undefined =>
    value !== undefined ? `"${value}"` : undefined;

  // Helper to set a value (handles both commented and uncommented lines)
  const setValue = (key: string, value: string | undefined) => {
    if (value === undefined) return;
    // Match both commented (# KEY=) and uncommented (KEY=) forms
    const patterns = [
      new RegExp(`^${key}=.*$`, "m"),
      new RegExp(`^# ${key}=.*$`, "m"),
    ];
    for (const pattern of patterns) {
      if (pattern.test(content)) {
        content = content.replace(pattern, `${key}=${value}`);
        return;
      }
    }
    // If not found, append to end
    content += `\n${key}=${value}`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Database & Redis
  // ─────────────────────────────────────────────────────────────────────────

  if (useDockerInfra) {
    // Set Docker-specific values
    setValue("POSTGRES_USER", env.POSTGRES_USER);
    setValue("POSTGRES_PASSWORD", env.POSTGRES_PASSWORD);
    setValue("POSTGRES_DB", env.POSTGRES_DB);
    setValue("DATABASE_URL", wrapInQuotes(env.DATABASE_URL));
    setValue("DIRECT_URL", wrapInQuotes(env.DIRECT_URL));
    setValue("UPSTASH_REDIS_URL", wrapInQuotes(env.UPSTASH_REDIS_URL));
    setValue("UPSTASH_REDIS_TOKEN", env.UPSTASH_REDIS_TOKEN);
  } else {
    // External infra - set placeholders
    setValue("DATABASE_URL", wrapInQuotes(env.DATABASE_URL));
    setValue("DIRECT_URL", wrapInQuotes(env.DIRECT_URL));
    setValue("UPSTASH_REDIS_URL", wrapInQuotes(env.UPSTASH_REDIS_URL));
    setValue("UPSTASH_REDIS_TOKEN", env.UPSTASH_REDIS_TOKEN);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // App Config
  // ─────────────────────────────────────────────────────────────────────────

  setValue("NEXT_PUBLIC_BASE_URL", env.NEXT_PUBLIC_BASE_URL);
  setValue(
    "NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS",
    env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Secrets
  // ─────────────────────────────────────────────────────────────────────────

  setValue("AUTH_SECRET", env.AUTH_SECRET);
  setValue("EMAIL_ENCRYPT_SECRET", env.EMAIL_ENCRYPT_SECRET);
  setValue("EMAIL_ENCRYPT_SALT", env.EMAIL_ENCRYPT_SALT);
  setValue("INTERNAL_API_KEY", env.INTERNAL_API_KEY);
  setValue("API_KEY_SALT", env.API_KEY_SALT);
  setValue("CRON_SECRET", env.CRON_SECRET);

  // ─────────────────────────────────────────────────────────────────────────
  // Google OAuth
  // ─────────────────────────────────────────────────────────────────────────

  setValue("GOOGLE_CLIENT_ID", env.GOOGLE_CLIENT_ID);
  setValue("GOOGLE_CLIENT_SECRET", env.GOOGLE_CLIENT_SECRET);
  setValue("GOOGLE_PUBSUB_TOPIC_NAME", env.GOOGLE_PUBSUB_TOPIC_NAME);
  setValue(
    "GOOGLE_PUBSUB_VERIFICATION_TOKEN",
    env.GOOGLE_PUBSUB_VERIFICATION_TOKEN,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Microsoft OAuth
  // ─────────────────────────────────────────────────────────────────────────

  setValue("MICROSOFT_CLIENT_ID", env.MICROSOFT_CLIENT_ID);
  setValue("MICROSOFT_CLIENT_SECRET", env.MICROSOFT_CLIENT_SECRET);
  setValue("MICROSOFT_TENANT_ID", env.MICROSOFT_TENANT_ID);
  setValue(
    "MICROSOFT_WEBHOOK_CLIENT_STATE",
    env.MICROSOFT_WEBHOOK_CLIENT_STATE,
  );

  // ─────────────────────────────────────────────────────────────────────────
  // LLM Configuration
  // ─────────────────────────────────────────────────────────────────────────

  // Set the active LLM provider
  setValue("DEFAULT_LLM_PROVIDER", env.DEFAULT_LLM_PROVIDER);
  setValue("DEFAULT_LLM_MODEL", env.DEFAULT_LLM_MODEL);
  setValue("ECONOMY_LLM_PROVIDER", env.ECONOMY_LLM_PROVIDER);
  setValue("ECONOMY_LLM_MODEL", env.ECONOMY_LLM_MODEL);

  // Set the API key for the selected provider
  if (llmProvider === "bedrock") {
    setValue("BEDROCK_ACCESS_KEY", env.BEDROCK_ACCESS_KEY);
    setValue("BEDROCK_SECRET_KEY", env.BEDROCK_SECRET_KEY);
    setValue("BEDROCK_REGION", env.BEDROCK_REGION);
  } else {
    const apiKeyMap: Record<string, string> = {
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      google: "GOOGLE_API_KEY",
      openrouter: "OPENROUTER_API_KEY",
      aigateway: "AI_GATEWAY_API_KEY",
      groq: "GROQ_API_KEY",
    };
    const apiKeyName = apiKeyMap[llmProvider];
    if (apiKeyName && env[apiKeyName]) {
      setValue(apiKeyName, env[apiKeyName]);
    }
  }

  return content;
}
