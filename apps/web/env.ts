/* eslint-disable no-process-env */
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]),
    DATABASE_URL: z.string().url(),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    GOOGLE_ENCRYPT_SECRET: z.string(),
    GOOGLE_ENCRYPT_SALT: z.string(),
    DEFAULT_LLM_PROVIDER: z
      .enum([
        "anthropic",
        // "bedrock",
        "google",
        "openai",
        "openrouter",
        "groq",
        "ollama",
        "custom",
      ])
      .default("anthropic"),
    DEFAULT_LLM_MODEL: z.string().optional(),
    // Economy LLM configuration (for large context windows where cost efficiency matters)
    ECONOMY_LLM_PROVIDER: z
      .enum([
        "anthropic",
        "google",
        "openai",
        "bedrock",
        "openrouter",
        "groq",
        "ollama",
      ])
      .optional()
      .default("openrouter"),
    ECONOMY_LLM_MODEL: z
      .string()
      .optional()
      .default("google/gemini-2.5-flash-preview-05-20"),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    BEDROCK_ACCESS_KEY: z.string().optional(),
    BEDROCK_SECRET_KEY: z.string().optional(),
    BEDROCK_REGION: z.string().default("us-west-2"),
    GOOGLE_API_KEY: z.string().optional(),
    GROQ_API_KEY: z.string().optional(),
    OPENROUTER_API_KEY: z.string().optional(),
    UPSTASH_REDIS_URL: z.string().optional(),
    UPSTASH_REDIS_TOKEN: z.string().optional(),
    REDIS_URL: z.string().optional(), // used for subscriptions
    OLLAMA_BASE_URL: z.string().optional(),
    QSTASH_TOKEN: z.string().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
    GOOGLE_PUBSUB_TOPIC_NAME: z.string().min(1),
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORGANIZATION: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    LOG_ZOD_ERRORS: z.coerce.boolean().optional(),
    // Lemon Squeezy
    LEMON_SQUEEZY_SIGNING_SECRET: z.string().optional(),
    LEMON_SQUEEZY_API_KEY: z.string().optional(),
    // Stripe
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    TINYBIRD_TOKEN: z.string().optional(),
    TINYBIRD_BASE_URL: z.string().default("https://api.us-east.tinybird.co/"),
    TINYBIRD_ENCRYPT_SECRET: z.string().optional(),
    TINYBIRD_ENCRYPT_SALT: z.string().optional(),
    API_KEY_SALT: z.string().optional(),
    POSTHOG_API_SECRET: z.string().optional(),
    POSTHOG_PROJECT_ID: z.string().optional(),
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
    INTERNAL_API_KEY: z.string(),
    WHITELIST_FROM: z.string().optional(),
    USE_BACKUP_MODEL: z.coerce.boolean().optional().default(false),
    HEALTH_API_KEY: z.string().optional(),

    // license
    LICENSE_1_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_3_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_5_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_10_SEAT_VARIANT_ID: z.coerce.number().optional(),
    LICENSE_25_SEAT_VARIANT_ID: z.coerce.number().optional(),

    DUB_API_KEY: z.string().optional(),
  },
  client: {
    // stripe
    NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID: z.string().optional(),

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
    NEXT_PUBLIC_BASE_URL: z.string().default("https://www.getinboxzero.com"),
    NEXT_PUBLIC_CONTACTS_ENABLED: z.coerce.boolean().optional().default(false),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    NEXT_PUBLIC_SUPPORT_EMAIL: z
      .string()
      .optional()
      .default("elie@getinboxzero.com"),
    NEXT_PUBLIC_GTM_ID: z.string().optional(),
    NEXT_PUBLIC_CRISP_WEBSITE_ID: z.string().optional(),
    NEXT_PUBLIC_WELCOME_UPGRADE_ENABLED: z.coerce
      .boolean()
      .optional()
      .default(false),
    NEXT_PUBLIC_AXIOM_DATASET: z.string().optional(),
    NEXT_PUBLIC_AXIOM_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BEDROCK_SONNET_MODEL: z
      .string()
      .default("us.anthropic.claude-3-7-sonnet-20250219-v1:0"),
    NEXT_PUBLIC_BEDROCK_ANTHROPIC_BACKUP_MODEL: z
      .string()
      .default("us.anthropic.claude-3-5-sonnet-20241022-v2:0"),
    NEXT_PUBLIC_OLLAMA_MODEL: z.string().optional(),
    NEXT_PUBLIC_APP_HOME_PATH: z.string().default("/setup"),
    NEXT_PUBLIC_DUB_REFER_DOMAIN: z.string().optional(),
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    // stripe
    NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID,
    NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID:
      process.env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID,

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
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_CONTACTS_ENABLED: process.env.NEXT_PUBLIC_CONTACTS_ENABLED,
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
    NEXT_PUBLIC_BEDROCK_SONNET_MODEL:
      process.env.NEXT_PUBLIC_BEDROCK_SONNET_MODEL,
    NEXT_PUBLIC_BEDROCK_ANTHROPIC_BACKUP_MODEL:
      process.env.NEXT_PUBLIC_BEDROCK_ANTHROPIC_BACKUP_MODEL,
    NEXT_PUBLIC_OLLAMA_MODEL: process.env.NEXT_PUBLIC_OLLAMA_MODEL,
    NEXT_PUBLIC_APP_HOME_PATH: process.env.NEXT_PUBLIC_APP_HOME_PATH,
    NEXT_PUBLIC_DUB_REFER_DOMAIN: process.env.NEXT_PUBLIC_DUB_REFER_DOMAIN,
  },
});
