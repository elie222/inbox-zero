import { env } from "@/env";
import { PremiumTier } from "@prisma/client";

type Feature = { text: string; tooltip?: string };

export type Tier = {
  name: string;
  tiers: { monthly: PremiumTier; annually: PremiumTier };
  price: { monthly: number; annually: number };
  priceAdditional: { monthly: number; annually: number };
  discount: { monthly: number; annually: number };
  quantity?: number;
  description: string;
  features: Feature[];
  cta: string;
  ctaLink?: string;
  mostPopular?: boolean;
};

const pricing: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 16,
  [PremiumTier.BASIC_ANNUALLY]: 8,
  [PremiumTier.PRO_MONTHLY]: 16,
  [PremiumTier.PRO_ANNUALLY]: 10,
  [PremiumTier.BUSINESS_MONTHLY]: 20,
  [PremiumTier.BUSINESS_ANNUALLY]: 16,
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: 50,
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: 42,
  [PremiumTier.COPILOT_MONTHLY]: 500,
  [PremiumTier.LIFETIME]: 299,
};

export const pricingAdditonalEmail: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 6,
  [PremiumTier.BASIC_ANNUALLY]: 6,
  [PremiumTier.PRO_MONTHLY]: 8,
  [PremiumTier.PRO_ANNUALLY]: 8,
  [PremiumTier.BUSINESS_MONTHLY]: 10,
  [PremiumTier.BUSINESS_ANNUALLY]: 10,
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: 25,
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: 25,
  [PremiumTier.COPILOT_MONTHLY]: 10,
  [PremiumTier.LIFETIME]: 99,
};

const variantIdToTier: Record<number, PremiumTier> = {
  [env.NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID]: PremiumTier.BASIC_MONTHLY,
  [env.NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID]: PremiumTier.BASIC_ANNUALLY,
  [env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID]: PremiumTier.PRO_MONTHLY,
  [env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID]: PremiumTier.PRO_ANNUALLY,
  [env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID]: PremiumTier.BUSINESS_MONTHLY,
  [env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID]: PremiumTier.BUSINESS_ANNUALLY,
  [env.NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID]: PremiumTier.COPILOT_MONTHLY,
};

// --- Stripe Configuration --- //

const STRIPE_PRICE_ID_CONFIG: Record<
  PremiumTier,
  {
    // active price id
    priceId?: string;
    // Allow handling of old price ids
    oldPriceIds?: string[];
  }
> = {
  [PremiumTier.BASIC_MONTHLY]: { priceId: "price_1RfeDLKGf8mwZWHn6UW8wJcY" },
  [PremiumTier.BASIC_ANNUALLY]: { priceId: "price_1RfeDLKGf8mwZWHn5kfC8gcM" },
  [PremiumTier.PRO_MONTHLY]: {},
  [PremiumTier.PRO_ANNUALLY]: {},
  [PremiumTier.BUSINESS_MONTHLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_MONTHLY_PRICE_ID,
    oldPriceIds: [
      "price_1RfoILKGf8mwZWHnDiUMj6no",
      "price_1RfeAFKGf8mwZWHnnnPzFEky",
      "price_1RfSoHKGf8mwZWHnxTsSDTqW",
      "price_1Rg0QfKGf8mwZWHnDsiocBVD",
      "price_1Rg0LEKGf8mwZWHndYXYg7ie",
      "price_1Rg03pKGf8mwZWHnWMNeQzLc",
    ],
  },
  [PremiumTier.BUSINESS_ANNUALLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_ANNUALLY_PRICE_ID,
    oldPriceIds: ["price_1RfSoxKGf8mwZWHngHcug4YM"],
  },
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_MONTHLY_PRICE_ID,
  },
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: {
    priceId: env.NEXT_PUBLIC_STRIPE_BUSINESS_PLUS_ANNUALLY_PRICE_ID,
  },
  [PremiumTier.COPILOT_MONTHLY]: {},
  [PremiumTier.LIFETIME]: {},
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

// --- End Stripe Configuration --- //

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

const aiAssistantFeature = {
  text: "AI personal assistant",
  tooltip: "AI assistant that drafts replies and organizes your inbox",
};

const replyZeroFeature = {
  text: "Auto drafted replies",
  tooltip: "Prewritten drafts ready to send in your inbox",
};

const coldEmailBlockerFeature = {
  text: "Cold email blocker",
  tooltip: "Automatically block cold emails",
};

// const smartCategoriesFeature = {
//   text: "Sender categories",
//   tooltip: "Automatically group emails for easier management and bulk actions",
// };

const bulkUnsubscribeFeature = {
  text: "Bulk unsubscriber",
  tooltip: "Bulk unsubscribe from emails in one-click",
};

const analyticsFeature = { text: "Email analytics" };

// const basicTier: Tier = {
//   name: "Unsubscriber",
//   tiers: {
//     monthly: PremiumTier.BASIC_MONTHLY,
//     annually: PremiumTier.BASIC_ANNUALLY,
//   },
//   price: { monthly: pricing.BASIC_MONTHLY, annually: pricing.BASIC_ANNUALLY },
//   priceAdditional: {
//     monthly: pricingAdditonalEmail.BASIC_MONTHLY,
//     annually: pricingAdditonalEmail.BASIC_ANNUALLY,
//   },
//   discount: {
//     monthly: 0,
//     annually: discount(pricing.BASIC_MONTHLY, pricing.BASIC_ANNUALLY),
//   },
//   description: "Unlimited unsubscribe credits.",
//   features: [
//     bulkUnsubscribeFeature,
//     { text: "Unlimited unsubscribes" },
//     { text: "Unlimited archives" },
//     analyticsFeature,
//   ],
//   cta: "Try free for 7 days",
// };

export const businessTierName = "Pro";

const businessTier: Tier = {
  name: businessTierName,
  tiers: {
    monthly: PremiumTier.BUSINESS_MONTHLY,
    annually: PremiumTier.BUSINESS_ANNUALLY,
  },
  price: {
    monthly: pricing.BUSINESS_MONTHLY,
    annually: pricing.BUSINESS_ANNUALLY,
  },
  priceAdditional: {
    monthly: pricingAdditonalEmail.BUSINESS_MONTHLY,
    annually: pricingAdditonalEmail.BUSINESS_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(pricing.BUSINESS_MONTHLY, pricing.BUSINESS_ANNUALLY),
  },
  description:
    "For individuals and businesses that want to get their email under control.",
  features: [
    aiAssistantFeature,
    replyZeroFeature,
    coldEmailBlockerFeature,
    bulkUnsubscribeFeature,
    analyticsFeature,
    { text: "Unlimited AI credits" },
    {
      text: "Basic Knowledge Base",
      tooltip:
        "The knowledge base is used to help draft responses. This plan includes 2000 characters in your knowledge base.",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: false,
};

const businessPlusTier: Tier = {
  name: "Business",
  tiers: {
    monthly: PremiumTier.BUSINESS_PLUS_MONTHLY,
    annually: PremiumTier.BUSINESS_PLUS_ANNUALLY,
  },
  price: {
    monthly: pricing.BUSINESS_PLUS_MONTHLY,
    annually: pricing.BUSINESS_PLUS_ANNUALLY,
  },
  priceAdditional: {
    monthly: pricingAdditonalEmail.BUSINESS_PLUS_MONTHLY,
    annually: pricingAdditonalEmail.BUSINESS_PLUS_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(
      pricing.BUSINESS_PLUS_MONTHLY,
      pricing.BUSINESS_PLUS_ANNUALLY,
    ),
  },
  description:
    "For teams handling high email volumes: streamline repetitive tasks, outreach, and support.",
  features: [
    aiAssistantFeature,
    replyZeroFeature,
    coldEmailBlockerFeature,
    bulkUnsubscribeFeature,
    analyticsFeature,
    { text: "Unlimited AI credits" },
    {
      text: "Unlimited Knowledge Base",
      tooltip:
        "The knowledge base is used to help draft responses. Store up to unlimited content in your knowledge base.",
    },
    { text: "Priority support" },
    {
      text: "Dedicated onboarding manager",
      tooltip:
        "We'll help you get set up on an onboarding call. Book as many free calls as needed.",
    },
  ],
  cta: "Try free for 7 days",
  mostPopular: true,
};

const enterpriseTier: Tier = {
  name: "Enterprise",
  tiers: {
    monthly: PremiumTier.COPILOT_MONTHLY,
    annually: PremiumTier.COPILOT_MONTHLY,
  },
  price: { monthly: 0, annually: 0 },
  priceAdditional: { monthly: 0, annually: 0 },
  discount: { monthly: 0, annually: 0 },
  description: "Custom solutions for large organizations",
  features: [
    {
      text: "Everything in Business, plus:",
    },
    {
      text: "Unlimited accounts & on-premise deployment",
    },
    {
      text: "Advanced security, SLA & dedicated support",
    },
  ],
  cta: "Speak to sales",
  ctaLink: "/sales",
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

export const tiers: Tier[] = [businessTier, businessPlusTier];
export { enterpriseTier };
