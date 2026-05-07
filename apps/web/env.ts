/* eslint-disable no-process-env */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { booleanString } from "@/utils/zod";

const llmProviderEnum = z.enum([
  "anthropic",
  "azure",
  "vertex",
  "google",
  "openai",
  "bedrock",
  "openrouter",
  "groq",
  "aigateway",
  "ollama",
  "openai-compatible",
  "codex-cli",
  "claude-code",
]);

/** For Vercel preview deployments, auto-detect from VERCEL_URL. */
const getBaseUrl = (): string | undefined => {
  const isOAuthProxyServer = process.env.IS_OAUTH_PROXY_SERVER === "true";
  if (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_URL &&
    !isOAuthProxyServer
  ) {
    return `https://${process.env.VERCEL_URL}`;
  }

  return process.env.NEXT_PUBLIC_BASE_URL;
};

const parsedEnv = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]),
    DATABASE_URL: z.string().url(),
    DATABASE_URL_UNPOOLED: z.string().url().optional(),
    PREVIEW_DATABASE_URL: z.string().url().optional(),
    PREVIEW_DATABASE_URL_UNPOOLED: z.preprocess(
      (value) => value ?? process.env.DATABASE_URL_UNPOOLED,
      z.string().url().optional(),
    ),

    AUTH_SECRET: z.string().optional(),
    NEXTAUTH_SECRET: z.string().optional(),
    AUTH_ALLOWED_EMAILS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ?.split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    AUTH_ALLOWED_EMAIL_DOMAINS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ?.split(",")
          .map((entry) => entry.trim())
          .filter(Boolean),
      ),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    // Local Google emulation only; used for both OAuth and resource APIs.
    GOOGLE_BASE_URL: z.string().url().optional(),
    // Local Microsoft emulation only; used for both OAuth and Microsoft Graph APIs.
    MICROSOFT_BASE_URL: z.string().url().optional(),
    MICROSOFT_CLIENT_ID: z.string().optional(),
    MICROSOFT_CLIENT_SECRET: z.string().optional(),
    MICROSOFT_TENANT_ID: z.string().optional().default("common"),
    APPLE_CLIENT_ID: z.string().optional(),
    APPLE_TEAM_ID: z.string().optional(),
    APPLE_KEY_ID: z.string().optional(),
    APPLE_PRIVATE_KEY: z.string().optional(),
    APPLE_APP_BUNDLE_IDENTIFIER: z.string().optional(),
    EMAIL_ENCRYPT_SECRET: z.string(),
    EMAIL_ENCRYPT_SALT: z.string(),

    DEFAULT_LLM_PROVIDER: z
      // custom is deprecated
      .enum([...llmProviderEnum.options, "custom"]),
    DEFAULT_LLM_MODEL: z.string().optional(),
    DEFAULT_LLM_FALLBACKS: z.string().optional(), // Comma-separated provider:model chain; explicit model required (e.g., "openrouter:anthropic/claude-sonnet-4.6,openai:gpt-5.1")
    DEFAULT_OPENROUTER_PROVIDERS: z.string().optional(), // Comma-separated list of OpenRouter providers for default model (e.g., "Google Vertex,Anthropic")
    // Set this to a cheaper model like Gemini Flash
    ECONOMY_LLM_PROVIDER: llmProviderEnum.optional(),
    ECONOMY_LLM_MODEL: z.string().optional(),
    ECONOMY_LLM_FALLBACKS: z.string().optional(), // Comma-separated provider:model chain for economy model; explicit model required
    ECONOMY_OPENROUTER_PROVIDERS: z.string().optional(), // Comma-separated list of OpenRouter providers for economy model (e.g., "Google Vertex,Anthropic")
    // Set this to a fast but strong model like Groq Kimi K2. Leaving blank will fallback to default which is also fine.
    CHAT_LLM_PROVIDER: llmProviderEnum.optional(),
    CHAT_LLM_MODEL: z.string().optional(),
    CHAT_LLM_FALLBACKS: z.string().optional(), // Comma-separated provider:model chain for chat model; explicit model required
    CHAT_OPENROUTER_PROVIDERS: z.string().optional(), // Comma-separated list of OpenRouter providers for chat (e.g., "Google Vertex,Anthropic")
    NANO_LLM_PROVIDER: llmProviderEnum.optional(),
    NANO_LLM_MODEL: z.string().optional(),
    // Set this to override the model used for drafting replies
    DRAFT_LLM_PROVIDER: llmProviderEnum.optional(),
    DRAFT_LLM_MODEL: z.string().optional(),
    AI_NANO_WEEKLY_SPEND_LIMIT_USD: z.coerce.number().positive().optional(),
    AI_TRIAL_WEEKLY_SPEND_LIMIT_USD: z.coerce.number().positive().optional(),
    // Unset defaults to ALLOW. Used when an account has not chosen a policy.
    SENSITIVE_DATA_POLICY_DEFAULT: z
      .enum(["ALLOW", "REDACT", "BLOCK"])
      .optional(),

    LLM_API_KEY: z.string().optional(),
    OPENAI_API_KEY: z.string().optional(),
    AZURE_API_KEY: z.string().optional(),
    AZURE_RESOURCE_NAME: z.string().optional(),
    AZURE_API_VERSION: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    BEDROCK_ACCESS_KEY: z.string().optional(),
    BEDROCK_SECRET_KEY: z.string().optional(),
    BEDROCK_REGION: z.string().default("us-west-2"),
    GOOGLE_API_KEY: z.string().optional(),
    GOOGLE_THINKING_BUDGET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int().nonnegative().optional(),
    ),
    GOOGLE_VERTEX_PROJECT: z.string().optional(),
    GOOGLE_VERTEX_LOCATION: z.string().optional().default("us-central1"),
    GOOGLE_VERTEX_CLIENT_EMAIL: z.string().optional(),
    GOOGLE_VERTEX_PRIVATE_KEY: z.string().optional(),
    GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    AI_GATEWAY_API_KEY: z.string().optional(),
    PERPLEXITY_API_KEY: z.string().optional(),
    OLLAMA_BASE_URL: z.string().optional(),
    OLLAMA_MODEL: z.string().optional(),
    OPENAI_COMPATIBLE_BASE_URL: z.string().optional(),
    OPENAI_COMPATIBLE_MODEL: z.string().optional(),
    CLI_LLM_ENABLED: booleanString.optional().default(false),
    CODEX_CLI_ALLOW_NPX: booleanString.optional().default(false),
    CODEX_CLI_PATH: z.string().optional(),

    OPENAI_ZERO_DATA_RETENTION: booleanString.optional().default(false),

    UPSTASH_REDIS_URL: z
      .string()
      .optional()
      .transform((value) => value || process.env.KV_REST_API_URL),
    UPSTASH_REDIS_TOKEN: z
      .string()
      .optional()
      .transform((value) => value || process.env.KV_REST_API_TOKEN),
    REDIS_URL: z
      .string()
      .optional()
      .transform((value) => value || process.env.KV_URL), // used for subscriptions

    QSTASH_TOKEN: z.string().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
    QUEUE_BACKEND: z.enum(["bullmq", "internal", "qstash"]).optional(),

    GOOGLE_PUBSUB_TOPIC_NAME: z.string().min(1),
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: z.string().optional(),

    MICROSOFT_WEBHOOK_CLIENT_STATE: z.string().optional(),

    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORGANIZATION: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    AXIOM_DATASET: z.string().optional(),
    AXIOM_TOKEN: z.string().optional(),
    AXIOM_AUDIT_DATASET: z.string().optional(),
    AXIOM_AUDIT_TOKEN: z.string().optional(),

    DISABLE_LOG_ZOD_ERRORS: booleanString.optional(),
    ENABLE_DEBUG_LOGS: booleanString.default(false),
    DIGEST_MAX_SUMMARIES_PER_24H: z.coerce
      .number()
      .int()
      .nonnegative()
      .default(50),
    REASONING_RETENTION_DAYS: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.number().int().nonnegative().optional(),
    ),

    // Lemon Squeezy
    LEMON_SQUEEZY_SIGNING_SECRET: z.string().optional(),
    LEMON_SQUEEZY_API_KEY: z.string().optional(),

    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    STRIPE_AI_GENERATION_OVERAGE_CONFIG: z.string().optional(),

    // Apple App Store
    APPLE_IAP_ISSUER_ID: z.string().uuid().optional(),
    APPLE_IAP_KEY_ID: z.string().min(1).optional(),
    APPLE_IAP_PRIVATE_KEY: z.string().min(1).optional(),
    APPLE_IAP_BUNDLE_ID: z.string().min(1).optional(),
    APPLE_IAP_APPLE_ID: z.coerce.number().int().positive().optional(),
    SUPERWALL_APP_STORE_CONNECT_FORWARD_URL: z.string().url().optional(),

    TINYBIRD_TOKEN: z.string().optional(),
    TINYBIRD_BASE_URL: z.string().default("https://api.us-east.tinybird.co/"),

    API_KEY_SALT: z.string().optional(),

    POSTHOG_API_SECRET: z.string().optional(),
    POSTHOG_PROJECT_ID: z.string().optional(),
    POSTHOG_LLM_EVALS_APPROVED_EMAILS: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    RESEND_AUDIENCE_ID: z.string().optional(),
    RESEND_FROM_EMAIL: z
      .string()
      .optional()
      .default("Inbox Zero <updates@transactional.getinboxzero.com>"),
    CRON_SECRET: z.string().optional(),
    LOOPS_API_SECRET: z.string().optional(),
    FB_CONVERSION_API_ACCESS_TOKEN: z.string().optional(),
    FB_PIXEL_ID: z.string().optional(),
    ADMINS: z
      .string()
      .optional()
      .transform((value) => value?.split(",")),
    WEBHOOK_URL: z.string().optional(),
    INTERNAL_API_URL: z.string().optional(),
    INTERNAL_API_KEY: z.string(),
    WHITELIST_FROM: z.string().optional(),
    HEALTH_API_KEY: z.string().optional(),
    OAUTH_PROXY_URL: z.string().url().optional(),
    IMAGE_PROXY_SIGNING_SECRET: z.string().min(16).optional(),
    // Set to true on the server that acts as the OAuth proxy (e.g., staging)
    IS_OAUTH_PROXY_SERVER: booleanString.optional().default(false),
    // Additional trusted origins for CORS (comma-separated, supports wildcards like https://*.vercel.app)
    ADDITIONAL_TRUSTED_ORIGINS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ?.split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      ),
    // Mobile auth trusted origin, e.g. inboxzero://
    MOBILE_AUTH_ORIGIN: z.string().trim().min(1).optional(),
    AUTO_JOIN_ORGANIZATION_ENABLED: booleanString.optional().default(false),
    AUTO_ENABLE_ORG_ANALYTICS: booleanString.optional().default(false),

    // license
    LICENSE_1_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_3_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_5_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_10_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_25_SEAT_VARIANT_ID: z.coerce.number().optional(),

    DUB_API_KEY: z.string().optional(),

    // Slack
    SLACK_CLIENT_ID: z.string().optional(),
    SLACK_CLIENT_SECRET: z.string().optional(),
    SLACK_SIGNING_SECRET: z.string().optional(),

    // Chat SDK messaging adapters
    TEAMS_BOT_APP_ID: z.string().optional(),
    TEAMS_BOT_APP_PASSWORD: z.string().optional(),
    TEAMS_BOT_APP_TENANT_ID: z.string().optional(),
    TEAMS_BOT_APP_TYPE: z.enum(["MultiTenant", "SingleTenant"]).optional(),
    TELEGRAM_BOT_TOKEN: z.string().optional(),
    TELEGRAM_BOT_SECRET_TOKEN: z.string().optional(),
    APP_REVIEW_DEMO_ENABLED: booleanString.optional().default(false),
    APP_REVIEW_DEMO_ACCOUNTS: z.string().optional(),
    SSO_LOGIN_ENABLED: booleanString.optional().default(false),
  },
  client: {
    // stripe
    NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID: z.string().optional(),

    // apple app store
    NEXT_PUBLIC_APPLE_IAP_STARTER_MONTHLY_PRODUCT_ID: z.string().optional(),
    NEXT_PUBLIC_APPLE_IAP_STARTER_ANNUALLY_PRODUCT_ID: z.string().optional(),

    // lemon squeezy
    NEXT_PUBLIC_LEMON_STORE_ID: z.string().nullish().default("inboxzero"),
    NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID: z.coerce.number().default(0),

    NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS: z.number().default(5),
    NEXT_PUBLIC_CALL_LINK: z
      .string()
      .default("https://cal.com/team/inbox-zero/feedback"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_API_HOST: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HERO_AB: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID: z.string().optional(),
    NEXT_PUBLIC_BASE_URL: z.string(),
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: z.string().url().optional(),
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE: booleanString
      .optional()
      .default(false),
    NEXT_PUBLIC_BRAND_NAME: z.string().trim().min(1).default("Inbox Zero"),
    NEXT_PUBLIC_BRAND_LOGO_URL: z.string().optional(),
    NEXT_PUBLIC_BRAND_ICON_URL: z.string().optional().default("/icon.png"),
    NEXT_PUBLIC_SLACK_BOT_NAME: z.string().trim().min(1).default("Inbox Zero"),
    NEXT_PUBLIC_CONTACTS_ENABLED: booleanString.optional().default(false),
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: booleanString.default(true),
    NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED: booleanString.optional().default(true),
    NEXT_PUBLIC_SHOW_APPLE_LOGIN: booleanString.optional().default(false),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SUPPORT_EMAIL: z
      .string()
      .optional()
      .default("elie@getinboxzero.com"),
    NEXT_PUBLIC_GTM_ID: z.string().optional(),
    NEXT_PUBLIC_CRISP_WEBSITE_ID: z.string().optional(),
    NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED: booleanString
      .optional()
      .default(false),
    NEXT_PUBLIC_AXIOM_DATASET: z.string().optional(),
    NEXT_PUBLIC_AXIOM_TOKEN: z.string().optional(),
    NEXT_PUBLIC_LOG_SCOPES: z
      .string()
      .optional()
      .transform((value) => {
        if (!value) return;
        return value.split(",");
      }),
    NEXT_PUBLIC_DUB_REFER_DOMAIN: z.string().optional(),
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE: booleanString
      .optional()
      .default(false),
    NEXT_PUBLIC_USE_AEONIK_FONT: booleanString.optional().default(false),
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS: booleanString.optional(),
    NEXT_PUBLIC_DIGEST_ENABLED: booleanString.optional(),
    NEXT_PUBLIC_MEETING_BRIEFS_ENABLED: booleanString.optional(),
    NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED: booleanString.optional(),
    NEXT_PUBLIC_INTEGRATIONS_ENABLED: booleanString.optional(),
    NEXT_PUBLIC_SMART_FILING_ENABLED: booleanString.optional(),
    NEXT_PUBLIC_CLEANER_ENABLED: booleanString.optional(),
    NEXT_PUBLIC_EXTERNAL_API_ENABLED: booleanString.optional().default(false),
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: booleanString.optional(),
    // When true, the deployment default is enforced and account-level edits are disabled.
    NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED: booleanString
      .optional()
      .default(false),
    NEXT_PUBLIC_IS_RESEND_CONFIGURED: booleanString.optional(),
    NEXT_PUBLIC_TABS_EXTENSION_ID: z
      .string()
      .optional()
      .default("iencpoofingkkakccoknbleilcliokfk"),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    // stripe
    NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID,

    // apple app store
    NEXT_PUBLIC_APPLE_IAP_STARTER_MONTHLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_APPLE_IAP_STARTER_MONTHLY_PRODUCT_ID,
    NEXT_PUBLIC_APPLE_IAP_STARTER_ANNUALLY_PRODUCT_ID:
      process.env.NEXT_PUBLIC_APPLE_IAP_STARTER_ANNUALLY_PRODUCT_ID,

    // lemon squeezy
    NEXT_PUBLIC_LEMON_STORE_ID: process.env.NEXT_PUBLIC_LEMON_STORE_ID,
    NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID,
    NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID,
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID,
    NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID,
    NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID,
    NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID,
    NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID,

    NEXT_PUBLIC_CALL_LINK: process.env.NEXT_PUBLIC_CALL_LINK,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_API_HOST: process.env.NEXT_PUBLIC_POSTHOG_API_HOST,
    NEXT_PUBLIC_POSTHOG_HERO_AB: process.env.NEXT_PUBLIC_POSTHOG_HERO_AB,
    NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID:
      process.env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID,
    NEXT_PUBLIC_BASE_URL: getBaseUrl(),
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL:
      process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL,
    NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE:
      process.env.NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE,
    NEXT_PUBLIC_BRAND_NAME: process.env.NEXT_PUBLIC_BRAND_NAME,
    NEXT_PUBLIC_BRAND_LOGO_URL: process.env.NEXT_PUBLIC_BRAND_LOGO_URL,
    NEXT_PUBLIC_BRAND_ICON_URL: process.env.NEXT_PUBLIC_BRAND_ICON_URL,
    NEXT_PUBLIC_SLACK_BOT_NAME: process.env.NEXT_PUBLIC_SLACK_BOT_NAME,
    NEXT_PUBLIC_CONTACTS_ENABLED: process.env.NEXT_PUBLIC_CONTACTS_ENABLED,
    NEXT_PUBLIC_EMAIL_SEND_ENABLED: process.env.NEXT_PUBLIC_EMAIL_SEND_ENABLED,
    NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED:
      process.env.NEXT_PUBLIC_WEBHOOK_ACTION_ENABLED,
    NEXT_PUBLIC_SHOW_APPLE_LOGIN: process.env.NEXT_PUBLIC_SHOW_APPLE_LOGIN,
    NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS:
      process.env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
    NEXT_PUBLIC_CRISP_WEBSITE_ID: process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID,
    NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED:
      process.env.NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED,
    NEXT_PUBLIC_AXIOM_DATASET: process.env.NEXT_PUBLIC_AXIOM_DATASET,
    NEXT_PUBLIC_AXIOM_TOKEN: process.env.NEXT_PUBLIC_AXIOM_TOKEN,
    NEXT_PUBLIC_LOG_SCOPES: process.env.NEXT_PUBLIC_LOG_SCOPES,
    NEXT_PUBLIC_DUB_REFER_DOMAIN: process.env.NEXT_PUBLIC_DUB_REFER_DOMAIN,
    NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE:
      process.env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE,
    NEXT_PUBLIC_USE_AEONIK_FONT: process.env.NEXT_PUBLIC_USE_AEONIK_FONT,
    NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS:
      process.env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS,
    NEXT_PUBLIC_DIGEST_ENABLED: process.env.NEXT_PUBLIC_DIGEST_ENABLED,
    NEXT_PUBLIC_MEETING_BRIEFS_ENABLED:
      process.env.NEXT_PUBLIC_MEETING_BRIEFS_ENABLED,
    NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED:
      process.env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED,
    NEXT_PUBLIC_INTEGRATIONS_ENABLED:
      process.env.NEXT_PUBLIC_INTEGRATIONS_ENABLED,
    NEXT_PUBLIC_SMART_FILING_ENABLED:
      process.env.NEXT_PUBLIC_SMART_FILING_ENABLED,
    NEXT_PUBLIC_CLEANER_ENABLED: process.env.NEXT_PUBLIC_CLEANER_ENABLED,
    NEXT_PUBLIC_EXTERNAL_API_ENABLED:
      process.env.NEXT_PUBLIC_EXTERNAL_API_ENABLED,
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED:
      process.env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED,
    NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED:
      process.env.NEXT_PUBLIC_SENSITIVE_DATA_POLICY_LOCKED,
    NEXT_PUBLIC_IS_RESEND_CONFIGURED:
      process.env.NEXT_PUBLIC_IS_RESEND_CONFIGURED,
    NEXT_PUBLIC_TABS_EXTENSION_ID: process.env.NEXT_PUBLIC_TABS_EXTENSION_ID,
  },
});

if (process.env.TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_SECRET_TOKEN) {
  throw new Error(
    "TELEGRAM_BOT_SECRET_TOKEN is required when TELEGRAM_BOT_TOKEN is set.",
  );
}

export const env = parsedEnv;
