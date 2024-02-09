import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(["development", "production", "test"]),
    DATABASE_URL: z.string().url(),
    NEXTAUTH_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1),
    UPSTASH_REDIS_URL: z.string().min(1),
    UPSTASH_REDIS_TOKEN: z.string().min(1),
    GOOGLE_PUBSUB_TOPIC_NAME: z.string().min(1),
    BASELIME_PROJECT_NAME: z.string().optional(),
    BASELIME_KEY: z.string().optional(),
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORGANIZATION: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    LOG_ZOD_ERRORS: z.coerce.boolean().optional(),
    LEMON_SQUEEZY_SIGNING_SECRET: z.string().optional(),
    LEMON_SQUEEZY_API_KEY: z.string().optional(),
    TINYBIRD_TOKEN: z.string().min(1),
    TINYBIRD_BASE_URL: z.string().default("https://api.us-east.tinybird.co/"),
    ENCRYPT_SECRET: z.string().optional(),
    ENCRYPT_SALT: z.string().optional(),
    POSTHOG_API_SECRET: z.string().optional(),
    POSTHOG_PROJECT_ID: z.string().optional(),
    RESEND_API_KEY: z.string().optional(),
    RESEND_AUDIENCE_ID: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    LOOPS_API_SECRET: z.string().optional(),
    ADMINS: z
      .string()
      .optional()
      .transform((value) => value?.split(",")),
  },
  client: {
    NEXT_PUBLIC_LEMON_STORE_ID: z.string().nullish().default("inboxzero"),

    // lemon plans
    // pro
    NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_LINK: z.string().default(""),
    NEXT_PUBLIC_PRO_ANNUALLY_PAYMENT_LINK: z.string().default(""),
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID: z.coerce.number().default(0),
    // business
    NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK: z.string().default(""),
    NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK: z.string().default(""),
    NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID: z.coerce.number().default(0),
    // lifetime
    NEXT_PUBLIC_LIFETIME_PAYMENT_LINK: z.string().default(""),
    NEXT_PUBLIC_LIFETIME_VARIANT_ID: z.coerce.number().default(0),
    NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_PAYMENT_LINK: z.string().default(""),
    NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_VARIANT_ID: z.coerce.number().default(0),

    NEXT_PUBLIC_UNSUBSCRIBE_CREDITS: z.number().default(5),
    NEXT_PUBLIC_CALL_LINK: z.string().default("https://cal.com/team/inbox-zero/feedback"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
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
  },
  // For Next.js >= 13.4.4, you only need to destructure client variables:
  experimental__runtimeEnv: {
    NEXT_PUBLIC_LEMON_STORE_ID: process.env.NEXT_PUBLIC_LEMON_STORE_ID,

    // pro
    NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_LINK:
      process.env.NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_LINK,
    NEXT_PUBLIC_PRO_ANNUALLY_PAYMENT_LINK:
      process.env.NEXT_PUBLIC_PRO_ANNUALLY_PAYMENT_LINK,
    NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID,
    NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID,
    // business
    NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK:
      process.env.NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK,
    NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK:
      process.env.NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK,
    NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID,
    NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID:
      process.env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID,
    // lifetime
    NEXT_PUBLIC_LIFETIME_PAYMENT_LINK:
      process.env.NEXT_PUBLIC_LIFETIME_PAYMENT_LINK,
    NEXT_PUBLIC_LIFETIME_VARIANT_ID:
      process.env.NEXT_PUBLIC_LIFETIME_VARIANT_ID,
    NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_PAYMENT_LINK:
      process.env.NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_PAYMENT_LINK,
    NEXT_PUBLIC_LIFETIME_EXTRA_SEATS_VARIANT_ID:
      process.env.NEXT_PUBLIC_LIFETIME_VARIANT_ID,

    NEXT_PUBLIC_CALL_LINK: process.env.NEXT_PUBLIC_CALL_LINK,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HERO_AB: process.env.NEXT_PUBLIC_POSTHOG_HERO_AB,
    NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID:
      process.env.NEXT_PUBLIC_POSTHOG_ONBOARDING_SURVEY_ID,
    NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
    NEXT_PUBLIC_CONTACTS_ENABLED: process.env.NEXT_PUBLIC_CONTACTS_ENABLED,
    NEXT_PUBLIC_LEMON_STORE_ID: process.env.NEXT_PUBLIC_LEMON_STORE_ID,
    NEXT_PUBLIC_UNSUBSCRIBE_CREDITS:
      process.env.NEXT_PUBLIC_UNSUBSCRIBE_CREDITS,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_GTM_ID: process.env.NEXT_PUBLIC_GTM_ID,
  },
});
