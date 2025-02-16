import { env } from "@/env";
import { PremiumTier } from "@prisma/client";

type Feature = {
  text: string;
  tooltip?: string;
};

type Tier = {
  name: string;
  tiers: { monthly: PremiumTier; annually: PremiumTier };
  href: { monthly: string; annually: string };
  price: { monthly: number; annually: number };
  priceAdditional: { monthly: number; annually: number };
  discount: { monthly: number; annually: number };
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
  [PremiumTier.BUSINESS_MONTHLY]: 24,
  [PremiumTier.BUSINESS_ANNUALLY]: 16,
  [PremiumTier.COPILOT_MONTHLY]: 499,
  [PremiumTier.LIFETIME]: 299,
};

export const pricingAdditonalEmail: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 6,
  [PremiumTier.BASIC_ANNUALLY]: 6,
  [PremiumTier.PRO_MONTHLY]: 8,
  [PremiumTier.PRO_ANNUALLY]: 8,
  [PremiumTier.BUSINESS_MONTHLY]: 12,
  [PremiumTier.BUSINESS_ANNUALLY]: 12,
  [PremiumTier.COPILOT_MONTHLY]: 0,
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
  [env.NEXT_PUBLIC_LIFETIME_VARIANT_ID]: PremiumTier.LIFETIME,
};

const tierToVariantId: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: env.NEXT_PUBLIC_BASIC_MONTHLY_VARIANT_ID,
  [PremiumTier.BASIC_ANNUALLY]: env.NEXT_PUBLIC_BASIC_ANNUALLY_VARIANT_ID,
  [PremiumTier.PRO_MONTHLY]: env.NEXT_PUBLIC_PRO_MONTHLY_VARIANT_ID,
  [PremiumTier.PRO_ANNUALLY]: env.NEXT_PUBLIC_PRO_ANNUALLY_VARIANT_ID,
  [PremiumTier.BUSINESS_MONTHLY]: env.NEXT_PUBLIC_BUSINESS_MONTHLY_VARIANT_ID,
  [PremiumTier.BUSINESS_ANNUALLY]: env.NEXT_PUBLIC_BUSINESS_ANNUALLY_VARIANT_ID,
  [PremiumTier.COPILOT_MONTHLY]: env.NEXT_PUBLIC_COPILOT_MONTHLY_VARIANT_ID,
  [PremiumTier.LIFETIME]: env.NEXT_PUBLIC_LIFETIME_VARIANT_ID,
};

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

const aiAssistantFeature = {
  text: "AI personal assistant",
  tooltip: "AI assistant that drafts replies and organizes your inbox.",
};

const replyZeroFeature = {
  text: "Reply Zero",
  tooltip:
    "Never miss a reply or follow up again. Every conversation missing a reply is labeled.",
};

const coldEmailBlockerFeature = {
  text: "Cold email blocker",
  tooltip: "Automatically block cold emails.",
};

const smartCategoriesFeature = {
  text: "Smart categories",
  tooltip:
    "Categorizes your emails into meaningful groups to take bulk actions on or apply rules to. e.g., archive thousands of newsletters in one click.",
};

const bulkUnsubscribeFeature = {
  text: "Bulk unsubscribe",
  tooltip:
    "Bulk unsubscribe from emails in one-click based on who emails you most, and which ones you don't read.",
};

const analyticsFeature = {
  text: "Email analytics",
  tooltip: "Understand your email habits and patterns.",
};

const basicTier = {
  name: "Unsubscriber",
  tiers: {
    monthly: PremiumTier.BASIC_MONTHLY,
    annually: PremiumTier.BASIC_ANNUALLY,
  },
  href: {
    monthly: env.NEXT_PUBLIC_BASIC_MONTHLY_PAYMENT_LINK,
    annually: env.NEXT_PUBLIC_BASIC_ANNUALLY_PAYMENT_LINK,
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
    analyticsFeature,
    { text: "Unlimited unsubscribes" },
    { text: "Unlimited archives" },
  ],
  cta: "Try free for 7 days",
};

export const businessTierName = "AI Assistant";

const businessTier = {
  name: businessTierName,
  tiers: {
    monthly: PremiumTier.BUSINESS_MONTHLY,
    annually: PremiumTier.BUSINESS_ANNUALLY,
  },
  href: {
    monthly: env.NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK,
    annually: env.NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK,
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
    {
      text: "Everything in Unsubscriber tier",
    },
    aiAssistantFeature,
    replyZeroFeature,
    coldEmailBlockerFeature,
    smartCategoriesFeature,
    { text: "Unlimited AI usage" },
    { text: "Priority support" },
  ],
  cta: "Try free for 7 days",
  mostPopular: true,
};

export const businessSingleTier: Tier = {
  name: businessTierName,
  tiers: {
    monthly: PremiumTier.BUSINESS_MONTHLY,
    annually: PremiumTier.BUSINESS_ANNUALLY,
  },
  href: {
    monthly: env.NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK,
    annually: env.NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK,
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
    aiAssistantFeature,
    replyZeroFeature,
    coldEmailBlockerFeature,
    smartCategoriesFeature,
    { text: "Unlimited AI usage" },
    bulkUnsubscribeFeature,
    analyticsFeature,
    { text: "Priority support" },
  ],
  cta: "Try free for 7 days",
};

const copilotTier = {
  name: "Co-Pilot",
  tiers: {
    monthly: PremiumTier.COPILOT_MONTHLY,
    annually: PremiumTier.COPILOT_MONTHLY,
  },
  href: {
    monthly: env.NEXT_PUBLIC_COPILOT_MONTHLY_PAYMENT_LINK,
    annually: env.NEXT_PUBLIC_COPILOT_MONTHLY_PAYMENT_LINK,
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
  description: "Expert human assistant to manage your email",
  features: [
    { text: "Everything in AI Assistant tier" },
    { text: "Human assistant to manage your email daily" },
    { text: "30-minute 1:1 monthly call" },
    { text: "Full refund if not satisfied after first 3 days" },
  ],
  cta: "Book a call",
  ctaLink: env.NEXT_PUBLIC_CALL_LINK,
  mostPopular: false,
};

export const allTiers: Tier[] = [basicTier, businessTier, copilotTier];

export function getSubscriptionTier({
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
