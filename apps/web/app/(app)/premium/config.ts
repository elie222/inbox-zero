import { env } from "@/env.mjs";
import { PremiumTier } from "@prisma/client";

export const frequencies = [
  { value: "monthly" as const, label: "Monthly", priceSuffix: "/month" },
  { value: "annually" as const, label: "Annually", priceSuffix: "/month" },
];

export const pricing: Record<PremiumTier, number> = {
  [PremiumTier.PRO_MONTHLY]: 14,
  [PremiumTier.PRO_ANNUALLY]: 9,
  [PremiumTier.BUSINESS_MONTHLY]: 22,
  [PremiumTier.BUSINESS_ANNUALLY]: 15,
  [PremiumTier.LIFETIME]: 299,
};

export const pricingAdditonalEmail: Record<PremiumTier, number> = {
  [PremiumTier.PRO_MONTHLY]: 3,
  [PremiumTier.PRO_ANNUALLY]: 2.5,
  [PremiumTier.BUSINESS_MONTHLY]: 3.5,
  [PremiumTier.BUSINESS_ANNUALLY]: 3,
  [PremiumTier.LIFETIME]: 59,
};

function discount(monthly: number, annually: number) {
  return ((monthly - annually) / monthly) * 100;
}

export const tiers = [
  {
    name: "Free",
    href: { monthly: "/welcome", annually: "/welcome" },
    price: { monthly: "$0", annually: "$0" },
    description: "Try Inbox Zero for free.",
    features: [
      "Bulk email unsubscriber",
      `Unsubscribe from ${env.NEXT_PUBLIC_UNSUBSCRIBE_CREDITS} emails per month`,
      "Email analytics",
    ],
    cta: "Get Started",
  },
  {
    name: "Pro",
    tiers: {
      monthly: PremiumTier.PRO_MONTHLY,
      annually: PremiumTier.PRO_ANNUALLY,
    },
    href: {
      monthly: env.NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_LINK,
      annually: env.NEXT_PUBLIC_PRO_ANNUALLY_PAYMENT_LINK,
    },
    checkout: true,
    price: { monthly: pricing.PRO_MONTHLY, annually: pricing.PRO_ANNUALLY },
    priceAdditional: {
      monthly: pricingAdditonalEmail.PRO_MONTHLY,
      annually: pricingAdditonalEmail.PRO_ANNUALLY,
    },
    discount: {
      monthly: 0,
      annually: discount(pricing.PRO_MONTHLY, pricing.PRO_ANNUALLY),
    },
    description:
      "Unlimited unsubscribe credits. Unlock AI features when using your own OpenAI key",
    features: [
      "Everything in free",
      "Unlimited unsubscribes",
      "AI automation when using your own OpenAI API key",
      "Cold email blocker when using your own OpenAI API key",
    ],
    cta: "Upgrade",
    mostPopular: false,
  },
  {
    name: "Business",
    tiers: {
      monthly: PremiumTier.BUSINESS_MONTHLY,
      annually: PremiumTier.BUSINESS_ANNUALLY,
    },
    href: {
      monthly: env.NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK,
      annually: env.NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK,
    },
    checkout: true,
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
      "Everything in pro",
      "AI automation",
      "Cold email blocker",
      "AI categorization",
      "No need to provide your own OpenAI API key",
      "Priority support",
    ],
    cta: "Upgrade",
    mostPopular: true,
    hideFrequency: false,
  },
  // {
  //   name: "Enterprise",
  //   id: "tier-enterprise",
  //   href: env.NEXT_PUBLIC_CALL_LINK,
  //   price: { monthly: "Book a call", annually: "Book a call" },
  //   description: "For help self-hosting, and dedicated support.",
  //   features: ["Self-hosted", "Everything in pro", "Dedicated support"],
  //   hideFrequency: true,
  //   cta: "Book a call",
  // },
];

export const lifetimeFeatures = [
  "Everything in Inbox Zero Business",
  "Priority support",
  "$100 of AI credits",
  "Early access to new features",
];
