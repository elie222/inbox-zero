import { env } from "@/env";
import { PremiumTier } from "@prisma/client";

export const frequencies = [
  { value: "monthly" as const, label: "Monthly", priceSuffix: "/month" },
  { value: "annually" as const, label: "Annually", priceSuffix: "/month" },
];

export const pricing: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 10,
  [PremiumTier.BASIC_ANNUALLY]: 6,
  [PremiumTier.PRO_MONTHLY]: 14,
  [PremiumTier.PRO_ANNUALLY]: 9,
  [PremiumTier.BUSINESS_MONTHLY]: 22,
  [PremiumTier.BUSINESS_ANNUALLY]: 15,
  [PremiumTier.COPILOT_MONTHLY]: 99,
  [PremiumTier.LIFETIME]: 299,
};

export const pricingAdditonalEmail: Record<PremiumTier, number> = {
  [PremiumTier.BASIC_MONTHLY]: 2,
  [PremiumTier.BASIC_ANNUALLY]: 1.5,
  [PremiumTier.PRO_MONTHLY]: 3,
  [PremiumTier.PRO_ANNUALLY]: 2.5,
  [PremiumTier.BUSINESS_MONTHLY]: 3.5,
  [PremiumTier.BUSINESS_ANNUALLY]: 3,
  [PremiumTier.COPILOT_MONTHLY]: 0,
  [PremiumTier.LIFETIME]: 59,
};

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

const basicTier = {
  name: "Basic",
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
  cta: "Upgrade",
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
  description: "Unlock AI features when using your own OpenAI key",
  features: [
    "Everything in free",
    "AI automation when using your own OpenAI API key",
    "Cold email blocker when using your own OpenAI API key",
  ],
  cta: "Upgrade",
  mostPopular: false,
};

const businessTier = {
  name: "Business",
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
  // features: [
  //   "Everything in pro",
  //   "Unlimited AI credits",
  //   "No need to provide your own OpenAI API key",
  //   "Priority support",
  // ],
  features: [
    "AI automation",
    "Bulk email unsubscriber",
    "Cold email blocker",
    "Email analytics",
    "Unlimited AI credits",
    "Priority support",
  ],
  cta: "Upgrade",
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
  description:
    "Get a 30-minute monthly call to help you get your email organized",
  features: [
    "Everything in Business",
    "30-minute 1:1 monthly call to help you get your email organized",
    "Full refund if not satisfied",
  ],
  cta: "Upgrade",
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
  mostPopular?: boolean;
}[] = [
  // basicTier,
  // proTier,
  businessTier,
  copilotTier,
];

export const lifetimeFeatures = [
  "Everything in Inbox Zero Business",
  "Priority support",
  "$100 of AI credits",
  "Early access to new features",
];
