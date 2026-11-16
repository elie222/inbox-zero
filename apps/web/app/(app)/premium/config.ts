import { env } from "@/env";
import type { PremiumTier } from "@/generated/prisma/enums";

type Feature = { text: string; tooltip?: string };

export type Tier = {
  name: string;
  tiers: { monthly: PremiumTier; annually: PremiumTier };
  price: { monthly: number; annually: number };
  discount: { monthly: number; annually: number };
  quantity?: number;
  description: string;
  features: Feature[];
  cta: string;
  ctaLink?: string;
  mostPopular?: boolean;
};

const pricing: Record<PremiumTier, number> = {
  BASIC_MONTHLY: 16,
  BASIC_ANNUALLY: 8,
  PRO_MONTHLY: 16,
  PRO_ANNUALLY: 10,
  STARTER_MONTHLY: 25,
  STARTER_ANNUALLY: 20,
  PLUS_MONTHLY: 35,
  PLUS_ANNUALLY: 28,
  PROFESSIONAL_MONTHLY: 50,
  PROFESSIONAL_ANNUALLY: 40,
  COPILOT_MONTHLY: 500,
  LIFETIME: 299,
};

const variantIdToTier: Record<number, PremiumTier> = {
  [env.NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID]: "BASIC_MONTHLY",
  [env.NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID]: "BASIC_ANNUALLY",
  [env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID]: "PRO_MONTHLY",
  [env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID]: "PRO_ANNUALLY",
  [env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID]: "STARTER_MONTHLY",
  [env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID]: "STARTER_ANNUALLY",
  [env.NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID]: "COPILOT_MONTHLY",
};

export const BRIEF_MY_MEETING_PRICE_ID_MONTHLY =
  "price_1SjoaXKGf8mwZWHnOdyaf2IN";
export const BRIEF_MY_MEETING_PRICE_ID_ANNUALLY =
  "price_1SjoawKGf8mwZWHnfAeShYhb";

// Grandfathered Plus and Professional monthly prices, and Plus annual, bill one
// unit per email account and treat each user's second account as free.
const LEGACY_INCLUDED_EMAIL_ACCOUNT_PRICE_IDS = [
  "price_1SzNImKGf8mwZWHnlYWXLNC4",
  "price_1SzNJEKGf8mwZWHndmH3lYxf",
  "price_1S5u6NKGf8mwZWHnZCfy4D5n",
];

// Current prices are graduated in Stripe to match: the first units up to this
// count cost the plan price, and each further unit costs `getExtraAccountPrice`.
export const INCLUDED_EMAIL_ACCOUNTS_PER_PERSON = 2;

const PER_PERSON_PRICE_IDS = [
  env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
  env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID,
  env.NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID,
  env.NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID,
  env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID,
  env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID,
];

const STRIPE_PRICE_ID_CONFIG: Record<
  PremiumTier,
  {
    // active price id
    priceId?: string;
    // Allow handling of old price ids
    oldPriceIds?: string[];
  }
> = {
  BASIC_MONTHLY: { priceId: "price_1RfeDLKGf8mwZWHn6UW8wJcY" },
  BASIC_ANNUALLY: { priceId: "price_1RfeDLKGf8mwZWHn5kfC8gcM" },
  PRO_MONTHLY: {},
  PRO_ANNUALLY: {},
  STARTER_MONTHLY: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    oldPriceIds: [
      "price_1T9FhCKGf8mwZWHn1olNzv6X",
      "price_1S5u73KGf8mwZWHn8VYFdALA",
      "price_1RMSnIKGf8mwZWHnlHP0212n",
      "price_1RfoILKGf8mwZWHnDiUMj6no",
      "price_1RfeAFKGf8mwZWHnnnPzFEky",
      "price_1RfSoHKGf8mwZWHnxTsSDTqW",
      "price_1Rg0QfKGf8mwZWHnDsiocBVD",
      "price_1Rg0LEKGf8mwZWHndYXYg7ie",
      "price_1Rg03pKGf8mwZWHnWMNeQzLc",
      BRIEF_MY_MEETING_PRICE_ID_MONTHLY,
    ],
  },
  STARTER_ANNUALLY: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u6uKGf8mwZWHnEvPWuQzG",
      "price_1S1QGGKGf8mwZWHnYpUcqNua",
      "price_1RMSnIKGf8mwZWHnymtuW2s0",
      "price_1RfSoxKGf8mwZWHngHcug4YM",
      // brief my meeting
      BRIEF_MY_MEETING_PRICE_ID_ANNUALLY,
    ],
  },
  PLUS_MONTHLY: {
    priceId: env.NEXT_PUBLIC_STRIPE_PLUS_MONTHLY_PRICE_ID,
    oldPriceIds: ["price_1SzNImKGf8mwZWHnlYWXLNC4"],
  },
  PLUS_ANNUALLY: {
    priceId: env.NEXT_PUBLIC_STRIPE_PLUS_ANNUALLY_PRICE_ID,
    oldPriceIds: ["price_1SzNJEKGf8mwZWHndmH3lYxf"],
  },
  PROFESSIONAL_MONTHLY: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u6NKGf8mwZWHnZCfy4D5n",
      "price_1RMSoMKGf8mwZWHn5fAKBT19",
    ],
  },
  PROFESSIONAL_ANNUALLY: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID,
    oldPriceIds: [
      "price_1S5u6XKGf8mwZWHnba8HX1H2",
      "price_1RMSoMKGf8mwZWHnGjf6fRmh",
    ],
  },
  COPILOT_MONTHLY: {},
  LIFETIME: {},
};

const APPLE_PRODUCT_ID_CONFIG: Partial<Record<PremiumTier, string>> = {
  STARTER_MONTHLY: env.NEXT_PUBLIC_APPLE_IAP_STARTER_MONTHLY_PRODUCT_ID,
  STARTER_ANNUALLY: env.NEXT_PUBLIC_APPLE_IAP_STARTER_ANNUALLY_PRODUCT_ID,
};

/**
 * App Store products sold by the native iOS app. Both grant the `pro`
 * Superwall entitlement, which is the Starter tier (the same tier Stripe's
 * business prices and Lemon's business variants map to).
 */
const APPLE_STARTER_PRODUCT_IDS: Record<string, PremiumTier> = {
  "com.getinboxzero.starter.monthly.v2": "STARTER_MONTHLY",
  "com.getinboxzero.starter.annual.v2": "STARTER_ANNUALLY",
};

export function getStripeSubscriptionTier({
  priceId,
}: {
  priceId: string;
}): PremiumTier | null {
  const entries = Object.entries(STRIPE_PRICE_ID_CONFIG);

  for (const [tier, config] of entries) {
    if (config.priceId === priceId || config.oldPriceIds?.includes(priceId)) {
      return tier as PremiumTier;
    }
  }
  return null;
}

export function getStripePriceId({
  tier,
}: {
  tier: PremiumTier;
}): string | null {
  return STRIPE_PRICE_ID_CONFIG[tier]?.priceId ?? null;
}

/**
 * How a Stripe price turns email accounts into a subscription quantity.
 * - `per_person`: the current graduated prices. The first 2 units cost the
 *   full plan price and each further unit costs half, so each person pays in
 *   full with 2 email accounts included.
 * - `legacy_included`: one unit per account, minus each user's second account.
 * - `per_account`: one unit per account.
 */
export function getStripeSeatModel(
  priceId: string | null | undefined,
): "per_person" | "legacy_included" | "per_account" {
  if (!priceId) return "per_account";
  if (LEGACY_INCLUDED_EMAIL_ACCOUNT_PRICE_IDS.includes(priceId)) {
    return "legacy_included";
  }
  // A legacy price can still be the configured price until the env var moves
  // to its replacement, and must keep billing per account until then.
  const isLegacyPrice = Object.values(STRIPE_PRICE_ID_CONFIG).some((config) =>
    config.oldPriceIds?.includes(priceId),
  );
  if (PER_PERSON_PRICE_IDS.includes(priceId) && !isLegacyPrice) {
    return "per_person";
  }
  return "per_account";
}

/** List price in cents for a per-person price, which has no unit amount. */
export function getStripePerPersonAmount({
  priceId,
  quantity,
}: {
  priceId: string;
  quantity: number;
}): number | undefined {
  if (getStripeSeatModel(priceId) !== "per_person") return;
  const tier = getStripeSubscriptionTier({ priceId });
  if (!tier) return;

  const months = tier.endsWith("_ANNUALLY") ? 12 : 1;
  const planAmount = pricing[tier] * months * 100;
  const extraUnits = Math.max(0, quantity - INCLUDED_EMAIL_ACCOUNTS_PER_PERSON);
  return planAmount + extraUnits * getExtraAccountPrice(planAmount);
}

export function getExtraAccountPrice(planPrice: number): number {
  return planPrice / 2;
}

export function getAddAccountBillingText(
  premium:
    | {
        tier: PremiumTier | null | undefined;
        stripePriceId: string | null | undefined;
      }
    | null
    | undefined,
): string {
  const seatModel = getStripeSeatModel(premium?.stripePriceId);

  if (seatModel === "per_person" && premium?.tier) {
    const extraAccountPrice = formatPrice(
      getExtraAccountPrice(pricing[premium.tier]),
    );
    const cadence = premium.tier.endsWith("_ANNUALLY")
      ? "/mo, billed annually"
      : "/mo";
    return `Your plan includes ${INCLUDED_EMAIL_ACCOUNTS_PER_PERSON} email accounts. Each extra account is ${extraAccountPrice}${cadence}.`;
  }
  if (seatModel === "legacy_included") {
    return "Your plan includes 2 email accounts. Each extra account is billed at your plan's per-account price.";
  }
  return "You will be billed for each account.";
}

export function formatPrice(amount: number): string {
  const cents = amount * 100;
  // Fractions of a cent come from spreading an annual price over 12 months.
  if (Math.abs(cents - Math.round(cents)) > 1e-6) {
    return `$${Math.round(amount)}`;
  }
  return Number.isInteger(amount) ? `$${amount}` : `$${amount.toFixed(2)}`;
}

export function getAppleSubscriptionTier({
  productId,
}: {
  productId: string;
}): PremiumTier | null {
  const starterTier = APPLE_STARTER_PRODUCT_IDS[productId];
  if (starterTier) return starterTier;

  for (const [tier, configuredProductId] of Object.entries(
    APPLE_PRODUCT_ID_CONFIG,
  )) {
    if (configuredProductId === productId) {
      return tier as PremiumTier;
    }
  }

  return null;
}

export function hasLegacyStripePriceId({
  tier,
  priceId,
}: {
  tier: PremiumTier | null | undefined;
  priceId: string | null | undefined;
}): boolean {
  if (!priceId) return false;

  const resolvedTier = tier || getStripeSubscriptionTier({ priceId });
  if (!resolvedTier) return false;

  const tierConfig = STRIPE_PRICE_ID_CONFIG[resolvedTier];
  if (!tierConfig) return false;
  // We sometimes reuse a historical price as the active price again.
  if (tierConfig.priceId === priceId) return false;

  return tierConfig.oldPriceIds?.includes(priceId) ?? false;
}

export function shouldShowLegacyStripePricingNotice(
  premium:
    | {
        tier: PremiumTier | null | undefined;
        stripePriceId: string | null | undefined;
        stripeSubscriptionStatus: string | null | undefined;
      }
    | null
    | undefined,
): boolean {
  if (!premium?.stripeSubscriptionStatus) return false;
  if (!["active", "trialing"].includes(premium.stripeSubscriptionStatus)) {
    return false;
  }

  return hasLegacyStripePriceId({
    tier: premium.tier,
    priceId: premium.stripePriceId,
  });
}

export function getPremiumTierName(
  tier: PremiumTier | null | undefined,
): string {
  if (!tier) return "Premium";

  const tierMap: Partial<Record<PremiumTier, string>> = {
    STARTER_MONTHLY: "Starter",
    STARTER_ANNUALLY: "Starter",
    PLUS_MONTHLY: "Plus",
    PLUS_ANNUALLY: "Plus",
    PROFESSIONAL_MONTHLY: "Professional",
    PROFESSIONAL_ANNUALLY: "Professional",
    COPILOT_MONTHLY: "Enterprise",
    BASIC_MONTHLY: "Basic",
    BASIC_ANNUALLY: "Basic",
    PRO_MONTHLY: "Pro",
    PRO_ANNUALLY: "Pro",
    LIFETIME: "Lifetime",
  };

  return tierMap[tier] ?? "Premium";
}

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

export const starterTierName = "Starter";

const starterTier: Tier = {
  name: starterTierName,
  tiers: {
    monthly: "STARTER_MONTHLY",
    annually: "STARTER_ANNUALLY",
  },
  price: {
    monthly: pricing.STARTER_MONTHLY,
    annually: pricing.STARTER_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(pricing.STARTER_MONTHLY, pricing.STARTER_ANNUALLY),
  },
  description:
    "For individuals, entrepreneurs, and executives looking to buy back their time.",
  features: [
    {
      text: "Sorts and labels every email",
    },
    {
      text: "Drafts replies in your voice",
    },
    {
      text: "Blocks cold emails",
    },
    {
      text: "Bulk unsubscribe and archive emails",
    },
    {
      text: "Email analytics",
    },
    {
      text: "Pre-meeting briefings",
      tooltip:
        "Get AI briefings before every meeting with research on attendees and context from your inbox.",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: false,
};

const plusTier: Tier = {
  name: "Plus",
  tiers: {
    monthly: "PLUS_MONTHLY",
    annually: "PLUS_ANNUALLY",
  },
  price: {
    monthly: pricing.PLUS_MONTHLY,
    annually: pricing.PLUS_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(pricing.PLUS_MONTHLY, pricing.PLUS_ANNUALLY),
  },
  description:
    "For power users who need integrations and deeper knowledge base support.",
  features: [
    {
      text: "Everything in Starter, plus:",
    },
    {
      text: "AI meeting notetaker",
      tooltip:
        "A notetaker joins your video calls and turns them into transcripts, summaries, recap emails, and follow-up drafts.",
    },
    {
      text: "Slack integration",
      tooltip:
        "Forward important emails and notifications to your Slack channels automatically.",
    },
    {
      text: "App integrations",
      tooltip:
        "Connect Notion, Stripe, Monday.com, and more so the AI can use data from your tools when drafting replies and meeting briefs.",
    },
    {
      text: "Email digests",
      tooltip:
        "Group emails from selected rules into a scheduled summary instead of reading each message individually.",
    },
    {
      text: "Auto-file attachments",
      tooltip:
        "Automatically organize and file email attachments to your preferred storage.",
    },
    {
      text: "Unlimited knowledge base",
      tooltip:
        "The knowledge base is used to help draft responses. Store unlimited content in your knowledge base.",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: true,
};

const professionalTier: Tier = {
  name: "Professional",
  tiers: {
    monthly: "PROFESSIONAL_MONTHLY",
    annually: "PROFESSIONAL_ANNUALLY",
  },
  price: {
    monthly: pricing.PROFESSIONAL_MONTHLY,
    annually: pricing.PROFESSIONAL_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(
      pricing.PROFESSIONAL_MONTHLY,
      pricing.PROFESSIONAL_ANNUALLY,
    ),
  },
  description: "For teams and growing businesses handling high email volumes.",
  features: [
    {
      text: "Everything in Plus, plus:",
    },
    { text: "Team-wide analytics" },
    { text: "Priority support" },
    {
      text: "Dedicated onboarding manager",
      tooltip:
        "We'll help you get set up on an onboarding call. Book as many free calls as needed.",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: false,
};

const enterpriseTier: Tier = {
  name: "Enterprise",
  tiers: {
    monthly: "COPILOT_MONTHLY",
    annually: "COPILOT_MONTHLY",
  },
  price: { monthly: 0, annually: 0 },
  discount: { monthly: 0, annually: 0 },
  description:
    "For organizations with enterprise-grade security and compliance requirements.",
  features: [
    {
      text: "Everything in Team, plus:",
    },
    {
      text: "SSO login",
    },
    {
      text: "SCIM user provisioning",
    },
    {
      text: "On-premise deployment (optional)",
    },
    {
      text: "Advanced security & SLA",
    },
    {
      text: "Dedicated account manager & training",
    },
  ],
  cta: "Speak to sales",
  ctaLink: "https://www.getinboxzero.com/sales",
  mostPopular: false,
};

export function getLemonSubscriptionTier({
  variantId,
}: {
  variantId: number;
}): PremiumTier {
  const tier = variantIdToTier[variantId];
  if (!tier) throw new Error(`Unknown variant id: ${variantId}`);
  return tier;
}

export const tiers: Tier[] = [starterTier, plusTier, professionalTier];
export { enterpriseTier };
