"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { RadioGroup } from "@headlessui/react";
import { CheckIcon, CreditCardIcon } from "lucide-react";
import clsx from "clsx";
import { env } from "@/env.mjs";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { getUserPlan } from "@/utils/premium";
import { PremiumTier } from "@prisma/client";

const frequencies = [
  { value: "monthly" as const, label: "Monthly", priceSuffix: "/month" },
  { value: "annually" as const, label: "Annually", priceSuffix: "/year" },
];

const tiers = [
  {
    name: "Free",
    id: "tier-free",
    href: { monthly: "/welcome", annually: "/welcome" },
    price: { monthly: "$0", annually: "$0" },
    description: "Try Inbox Zero for free.",
    features: [
      `Unsubscribe from ${env.NEXT_PUBLIC_UNSUBSCRIBE_CREDITS} emails per month`,
      "Email analytics",
      "Newsletter management",
      "New senders",
      "Inbox view",
    ],
    cta: "Get Started",
  },
  {
    name: "Pro",
    id: "tier-pro",
    href: {
      monthly: env.NEXT_PUBLIC_PRO_MONTHLY_PAYMENT_LINK,
      annually: env.NEXT_PUBLIC_PRO_ANNUALLY_PAYMENT_LINK,
    },
    checkout: true,
    price: { monthly: "$10", annually: "$99" },
    priceAdditional: { monthly: "$2", annually: "$19" },
    description: "Unlock full newsletter cleaner access.",
    features: [
      "Everything in free",
      "Unlimited unsubscribes",
      "Cold email blocker with personal OpenAI key",
      "AI with personal OpenAI key",
      "Priority support",
    ],
    cta: "Upgrade",
    mostPopular: true,
  },
  {
    name: "Business",
    id: "tier-business",
    href: {
      monthly: env.NEXT_PUBLIC_BUSINESS_MONTHLY_PAYMENT_LINK,
      annually: env.NEXT_PUBLIC_BUSINESS_ANNUALLY_PAYMENT_LINK,
    },
    checkout: true,
    price: { monthly: "$19", annually: "$159" },
    priceAdditional: { monthly: "$3", annually: "$29" },
    description: "Unlock full platform access.",
    features: [
      "Everything in pro",
      "Cold email blocker",
      "AI automations",
      "AI categorization",
      "AI planning mode",
    ],
    cta: "Upgrade",
    mostPopular: false,
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

const LIFETIME_PRICE = 199;
const LIFETIME_LINK = env.NEXT_PUBLIC_LIFETIME_PAYMENT_LINK;

const lifetimeFeatures = [
  "Everything in Inbox Zero Business",
  "Priority support",
  "$100 of AI credits",
  "Early access to new features",
];

function attachUserId(url: string, userId?: string) {
  if (!userId) return url;

  return `${url}?checkout[custom][user_id]=${userId}`;
}

function useAffiliateCode() {
  const searchParams = useSearchParams();
  const affiliateCode = searchParams.get("aff");
  return affiliateCode;
}

function buildLemonUrl(url: string, affiliateCode: string | null) {
  if (!affiliateCode) return url;
  const newUrl = `${url}?aff_ref=${affiliateCode}`;
  return newUrl;
}

export function Pricing() {
  const { isPremium, data, isLoading, error } = usePremium();

  const [frequency, setFrequency] = useState(frequencies[0]);

  const affiliateCode = useAffiliateCode();
  const planType =
    data?.premium?.tier || getUserPlan(data?.premium?.lemonSqueezyRenewsAt);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div
        id="pricing"
        className="relative isolate mx-auto max-w-7xl bg-white px-6 pb-32 pt-10 lg:px-8"
      >
        <div className="mx-auto max-w-2xl text-center lg:max-w-4xl">
          <h2 className="font-cal text-base leading-7 text-blue-600">
            Pricing
          </h2>
          <p className="mt-2 font-cal text-4xl text-gray-900 sm:text-5xl">
            Try for free, affordable paid plans
          </p>
        </div>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600">
          Clean your email and reach inbox zero fast with AI assistance.
        </p>

        {isPremium && (
          <div className="mt-8 text-center">
            <Button
              link={{
                href: `https://${env.NEXT_PUBLIC_LEMON_STORE_ID}.lemonsqueezy.com/billing`,
                target: "_blank",
              }}
            >
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Manage subscription
            </Button>
          </div>
        )}

        <div className="mt-16 flex justify-center">
          <RadioGroup
            value={frequency}
            onChange={setFrequency}
            className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center text-xs font-semibold leading-5 ring-1 ring-inset ring-gray-200"
          >
            <RadioGroup.Label className="sr-only">
              Payment frequency
            </RadioGroup.Label>
            {frequencies.map((option) => (
              <RadioGroup.Option
                key={option.value}
                value={option}
                className={({ checked }) =>
                  clsx(
                    checked ? "bg-black text-white" : "text-gray-500",
                    "cursor-pointer rounded-full px-2.5 py-1",
                  )
                }
              >
                <span>{option.label}</span>
              </RadioGroup.Option>
            ))}
          </RadioGroup>
        </div>

        <div className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-y-8 lg:mx-0 lg:max-w-none lg:grid-cols-3">
          {tiers.map((tier, tierIdx) => {
            const isCurrentPlan = tier.id === planType;

            const href = isCurrentPlan
              ? "#"
              : buildLemonUrl(
                  tier.checkout
                    ? attachUserId(tier.href[frequency.value], data?.id)
                    : tier.href[frequency.value],
                  affiliateCode,
                );

            return (
              <div
                key={tier.id}
                className={clsx(
                  tier.mostPopular ? "lg:z-10 lg:rounded-b-none" : "lg:mt-8",
                  tierIdx === 0 ? "lg:rounded-r-none" : "",
                  tierIdx === tiers.length - 1 ? "lg:rounded-l-none" : "",
                  "flex flex-col justify-between rounded-3xl bg-white p-8 ring-1 ring-gray-200 xl:p-10",
                )}
              >
                <div>
                  <div className="flex items-center justify-between gap-x-4">
                    <h3
                      id={tier.id}
                      className={clsx(
                        tier.mostPopular ? "text-blue-600" : "text-gray-900",
                        "font-cal text-lg leading-8",
                      )}
                    >
                      {tier.name}
                    </h3>
                    {tier.mostPopular ? (
                      <p className="rounded-full bg-blue-600/10 px-2.5 py-1 font-cal text-xs leading-5 text-blue-600">
                        Most popular
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-4 text-sm leading-6 text-gray-600">
                    {tier.description}
                  </p>
                  <p className="mt-6 flex items-baseline gap-x-1">
                    <span className="text-4xl font-bold tracking-tight text-gray-900">
                      {tier.price[frequency.value]}
                    </span>
                    {!tier.hideFrequency && (
                      <span className="text-sm font-semibold leading-6 text-gray-600">
                        {frequency.priceSuffix}
                      </span>
                    )}
                  </p>
                  {tier.priceAdditional ? (
                    <p className="mt-3 text-sm leading-6 text-gray-500">
                      +{tier.priceAdditional[frequency.value]} for each
                      additional email
                    </p>
                  ) : (
                    <div className="mt-16" />
                  )}
                  <ul
                    role="list"
                    className="mt-8 space-y-3 text-sm leading-6 text-gray-600"
                  >
                    {tier.features.map((feature) => (
                      <li key={feature} className="flex gap-x-3">
                        <CheckIcon
                          className="h-6 w-5 flex-none text-blue-600"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>

                <a
                  href={href}
                  target={href.startsWith("http") ? "_blank" : undefined}
                  aria-describedby={tier.id}
                  className={clsx(
                    tier.mostPopular
                      ? "bg-blue-600 text-white shadow-sm hover:bg-blue-500"
                      : "text-blue-600 ring-1 ring-inset ring-blue-200 hover:ring-blue-300",
                    "mt-8 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                  )}
                >
                  {isCurrentPlan ? "Current plan" : tier.cta}
                </a>
              </div>
            );
          })}
        </div>

        <LifetimePricing
          userId={data?.id}
          affiliateCode={affiliateCode}
          planType={planType}
        />
      </div>
    </LoadingContent>
  );
}

function LifetimePricing(props: {
  userId?: string;
  affiliateCode: string | null;
  planType?: PremiumTier | null;
}) {
  return (
    <div className="bg-white py-4 sm:py-8">
      <div className="mx-auto max-w-2xl rounded-3xl ring-1 ring-gray-200 lg:mx-0 lg:flex lg:max-w-none">
        <div className="p-8 sm:p-10 lg:flex-auto">
          <h3 className="flex items-center font-cal text-2xl text-gray-900">
            Lifetime access
            <div className="ml-4">
              <Tag color="green">Limited Time Offer</Tag>
            </div>
          </h3>
          <p className="mt-6 text-base leading-7 text-gray-600">
            Get lifetime access to Inbox Zero Pro for a one-time payment.
            <br />
            Includes $100 in AI credits.
          </p>
          <div className="mt-10 flex items-center gap-x-4">
            <h4 className="flex-none font-cal text-sm leading-6 text-blue-600">
              What’s included
            </h4>
            <div className="h-px flex-auto bg-gray-100" />
          </div>
          <ul
            role="list"
            className="mt-8 grid grid-cols-1 gap-4 text-sm leading-6 text-gray-600 sm:grid-cols-2 sm:gap-6"
          >
            {lifetimeFeatures.map((feature) => (
              <li key={feature} className="flex gap-x-3">
                <CheckIcon
                  className="h-6 w-5 flex-none text-blue-600"
                  aria-hidden="true"
                />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <div className="-mt-2 p-2 lg:mt-0 lg:w-full lg:max-w-md lg:flex-shrink-0">
          <div className="rounded-2xl bg-gray-50 py-10 text-center ring-1 ring-inset ring-gray-900/5 lg:flex lg:flex-col lg:justify-center lg:py-16">
            <div className="mx-auto max-w-xs px-8">
              <p className="text-base font-semibold text-gray-600">
                Lifetime access to Inbox Zero
              </p>
              <p className="mt-6 flex items-baseline justify-center gap-x-2">
                <span className="text-5xl font-bold tracking-tight text-gray-900">
                  ${LIFETIME_PRICE}
                </span>
                <span className="text-sm font-semibold leading-6 tracking-wide text-gray-600">
                  USD
                </span>
              </p>
              <a
                href={buildLemonUrl(
                  attachUserId(LIFETIME_LINK, props.userId),
                  props.affiliateCode,
                )}
                target="_blank"
                className="mt-10 block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {props.planType === PremiumTier.LIFETIME
                  ? "Current plan"
                  : "Get lifetime access"}
              </a>
              <p className="mt-6 text-xs leading-5 text-gray-600">
                Invoices and receipts available for easy company reimbursement
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
