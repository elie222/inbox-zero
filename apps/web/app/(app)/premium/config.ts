import { env } from "@/env";
import { isDefined } from "@/utils/types";
import { PremiumTier } from "@prisma/client";

type Feature = { text: string; tooltip?: string };

type Tier = {
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

export const frequencies = [
  { value: "monthly" as const, label: "Monthly", priceSuffix: "/month" },
  { value: "annually" as const, label: "Annually", priceSuffix: "/month" },
];

const pricing: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 16,
  [PremiumTier.BASIC_ANNUALLY]: 8,
  [PremiumTier.PRO_MONTHLY]: 16,
  [PremiumTier.PRO_ANNUALLY]: 10,
  [PremiumTier.BUSINESS_MONTHLY]: 20,
  [PremiumTier.BUSINESS_ANNUALLY]: 17,
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
  [PremiumTier.BASIC_MONTHLY]: {},
  [PremiumTier.BASIC_ANNUALLY]: {},
  [PremiumTier.PRO_MONTHLY]: {},
  [PremiumTier.PRO_ANNUALLY]: {},
  // TODO: env
  [PremiumTier.BUSINESS_MONTHLY]: { priceId: "" },
  [PremiumTier.BUSINESS_ANNUALLY]: { priceId: "" },
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: { priceId: "" },
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: { priceId: "" },
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

const tierToVariantId: Record<PremiumTier, number | null> = {
  [PremiumTier.BASIC_MONTHLY]: env.NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID,
  [PremiumTier.BASIC_ANNUALLY]: env.NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID,
  [PremiumTier.PRO_MONTHLY]: env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID,
  [PremiumTier.PRO_ANNUALLY]: env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID,
  [PremiumTier.BUSINESS_MONTHLY]: env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID,
  [PremiumTier.BUSINESS_ANNUALLY]: env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID,
  [PremiumTier.BUSINESS_PLUS_MONTHLY]: null,
  [PremiumTier.BUSINESS_PLUS_ANNUALLY]: null,
  [PremiumTier.COPILOT_MONTHLY]: env.NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID,
  [PremiumTier.LIFETIME]: null,
};

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

const aiAssistantFeature = {
  text: "AI personal assistant",
  tooltip: "AI assistant that drafts replies and organizes your inbox",
};

const replyZeroFeature = {
  text: "Reply Zero",
  tooltip: "Never miss a reply or follow up again",
};

const coldEmailBlockerFeature = {
  text: "Cold email blocker",
  tooltip: "Automatically block cold emails",
};

const smartCategoriesFeature = {
  text: "Sender categories",
  tooltip: "Automatically group emails for easier management and bulk actions",
};

const bulkUnsubscribeFeature = {
  text: "Bulk unsubscribe",
  tooltip: "Bulk unsubscribe from emails in one-click",
};

const analyticsFeature = { text: "Email analytics" };

export const basicTier: Tier = {
  name: "Unsubscriber",
  tiers: {
    monthly: PremiumTier.BASIC_MONTHLY,
    annually: PremiumTier.BASIC_ANNUALLY,
  },
  price: { monthly: pricing.BASIC_MONTHLY, annually: pricing.BASIC_ANNUALLY },
  priceAdditional: {
    monthly: pricingAdditonalEmail.BASIC_MONTHLY,
    annually: pricingAdditonalEmail.BASIC_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(pricing.BASIC_MONTHLY, pricing.BASIC_ANNUALLY),
  },
  description: "Unlimited unsubscribe credits.",
  features: [
    bulkUnsubscribeFeature,
    { text: "Unlimited unsubscribes" },
    { text: "Unlimited archives" },
    analyticsFeature,
  ],
  cta: "Try free for 7 days",
};

export const businessTierName = "AI Assistant";

export const businessTier: Tier = {
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
  description: "Unlock full AI-powered email management",
  features: [
    { text: "Everything in Unsubscriber tier" },
    aiAssistantFeature,
    replyZeroFeature,
    coldEmailBlockerFeature,
    smartCategoriesFeature,
    { text: "Unlimited AI credits" },
    { text: "Priority support" },
  ],
  cta: "Try free for 7 days",
  mostPopular: true,
};

export const enterpriseTier: Tier = {
  name: "Enterprise",
  tiers: {
    monthly: PremiumTier.COPILOT_MONTHLY,
    annually: PremiumTier.COPILOT_MONTHLY,
  },
  price: {
    monthly: pricing.COPILOT_MONTHLY,
    annually: pricing.COPILOT_MONTHLY,
  },
  priceAdditional: {
    monthly: pricingAdditonalEmail.COPILOT_MONTHLY,
    annually: pricingAdditonalEmail.COPILOT_MONTHLY,
  },
  discount: { monthly: 0, annually: 0 },
  description: "Self-hosted, bring your own LLM",
  features: [
    {
      text: "25 email accounts included",
    },
    {
      text: "Self-hosted deployment",
    },
    { text: "Setup assistance" },
    { text: "Dedicated account manager" },
    {
      text: "Everything in AI Assistant tier",
    },
  ],
  cta: "Book a call",
  ctaLink: env.NEXT_PUBLIC_CALL_LINK,
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

export function getVariantId({ tier }: { tier: PremiumTier }): number {
  const variantId = tierToVariantId[tier];
  if (!variantId) throw new Error(`Unknown tier: ${tier}`);
  return variantId;
}
