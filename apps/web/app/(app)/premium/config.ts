import { env } from "@/env";
import { PremiumTier } from "@prisma/client";

export const frequencies = [
  { value: "monthly" as const, label: "Monthly", priceSuffix: "/month" },
  { value: "annually" as const, label: "Annually", priceSuffix: "/month" },
];

export const pricing: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 12,
  [PremiumTier.BASIC_ANNUALLY]: 6,
  [PremiumTier.PRO_MONTHLY]: 16,
  [PremiumTier.PRO_ANNUALLY]: 8,
  [PremiumTier.BUSINESS_MONTHLY]: 24,
  [PremiumTier.BUSINESS_ANNUALLY]: 12,
  [PremiumTier.COPILOT_MONTHLY]: 499,
  [PremiumTier.LIFETIME]: 299,
};

export const pricingAdditonalEmail: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 4,
  [PremiumTier.BASIC_ANNUALLY]: 4,
  [PremiumTier.PRO_MONTHLY]: 6,
  [PremiumTier.PRO_ANNUALLY]: 6,
  [PremiumTier.BUSINESS_MONTHLY]: 8,
  [PremiumTier.BUSINESS_ANNUALLY]: 8,
  [PremiumTier.COPILOT_MONTHLY]: 0,
  [PremiumTier.LIFETIME]: 99,
};

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

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
    "Bulk email unsubscriber",
    "Unlimited unsubscribes",
    "Unlimited archives",
    "Email analytics",
  ],
  cta: "Try free for 7 days",
};

const proTier = {
  name: "Pro",
  tiers: {
    monthly: PremiumTier.PRO_MONTHLY,
    annually: PremiumTier.PRO_ANNUALLY,
  },
  href: {
    monthly: env.NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_LINK,
    annually: env.NEXT_PUBLIC_PRO_ANNUALLY_PAYMENT_LINK,
  },
  price: { monthly: pricing.PRO_MONTHLY, annually: pricing.PRO_ANNUALLY },
  priceAdditional: {
    monthly: pricingAdditonalEmail.PRO_MONTHLY,
    annually: pricingAdditonalEmail.PRO_ANNUALLY,
  },
  discount: {
    monthly: 0,
    annually: discount(pricing.PRO_MONTHLY, pricing.PRO_ANNUALLY),
  },
  description: "Unlock AI features when using your own AI API key",
  features: [
    "Everything in Basic",
    "AI personal assistant when using your own AI API key",
    "Cold email blocker when using your own AI API key",
  ],
  cta: "Try free for 7 days",
  mostPopular: false,
};

const businessTier = {
  name: "AI Assistant",
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
    "Everything in Basic",
    "AI personal assistant",
    "Cold email blocker",
    "Unlimited AI credits",
    "Priority support",
  ],
  cta: "Try free for 7 days",
  mostPopular: true,
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
    "Everything in Business",
    "Human assistant to manage your email daily",
    "30-minute 1:1 monthly call",
    "Full refund if not satisfied after first 3 days",
  ],
  cta: "Book a call",
  ctaLink: env.NEXT_PUBLIC_CALL_LINK,
  mostPopular: false,
};

export const tiers: {
  name: string;
  tiers: { monthly: PremiumTier; annually: PremiumTier };
  href: { monthly: string; annually: string };
  price: { monthly: number; annually: number };
  priceAdditional: { monthly: number; annually: number };
  discount: { monthly: number; annually: number };
  description: string;
  features: string[];
  cta: string;
  ctaLink?: string;
  mostPopular?: boolean;
}[] = [
  basicTier,
  // proTier,
  businessTier,
  copilotTier,
];

export const lifetimeFeatures = [
  "Everything in Inbox Zero AI",
  "Priority support",
  "$100 of AI credits",
  "Early access to new features",
];
