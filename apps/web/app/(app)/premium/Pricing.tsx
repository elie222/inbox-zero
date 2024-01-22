"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { RadioGroup } from "@headlessui/react";
import { CheckIcon, CreditCardIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { capitalCase } from "capital-case";
import Link from "next/link";
import clsx from "clsx";
import { sendGTMEvent } from "@next/third-parties/google";
import { env } from "@/env.mjs";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { Button as ShadcnButton } from "@/components/ui/button";
import { getUserTier } from "@/utils/premium";
import { PremiumTier } from "@prisma/client";
import {
  frequencies,
  lifetimeFeatures,
  pricing,
  pricingAdditonalEmail,
  tiers,
} from "@/app/(app)/premium/config";
import { AlertWithButton } from "@/components/Alert";

function attachUserInfo(
  url: string,
  user: { id: string; email: string; name?: string | null },
) {
  if (!user) return url;

  return `${url}?checkout[custom][user_id]=${user.id}&checkout[email]=${user.email}&checkout[name]=${user.name}`;
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
  const session = useSession();

  const [frequency, setFrequency] = useState(frequencies[0]);

  const affiliateCode = useAffiliateCode();
  const premiumTier = getUserTier(data?.premium);

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

            {premiumTier && (
              <div className="mx-auto mt-4 max-w-md">
                <AlertWithButton
                  variant="blue"
                  title="Add extra users to your account!"
                  description={`You can upgrade extra emails to ${capitalCase(
                    premiumTier,
                  )} for ${pricingAdditonalEmail[premiumTier]} per email!`}
                  icon={null}
                  button={
                    <div className="ml-4 whitespace-nowrap">
                      <ShadcnButton asChild variant="blue">
                        <Link href="/settings#manage-users">Add users</Link>
                      </ShadcnButton>
                    </div>
                  }
                />
              </div>
            )}
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
            const isCurrentPlan = tier.tiers?.[frequency.value] === premiumTier;

            const user = session.data?.user;

            const href = user
              ? isCurrentPlan
                ? "#"
                : buildLemonUrl(
                    tier.checkout
                      ? attachUserInfo(tier.href[frequency.value], {
                          id: user.id,
                          email: user.email!,
                          name: user.name,
                        })
                      : tier.href[frequency.value],
                    affiliateCode,
                  )
              : "/login?next=/premium";

            return (
              <div
                key={tier.name}
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
                      id={tier.name}
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
                  aria-describedby={tier.name}
                  className={clsx(
                    tier.mostPopular
                      ? "bg-blue-600 text-white shadow-sm hover:bg-blue-500"
                      : "text-blue-600 ring-1 ring-inset ring-blue-200 hover:ring-blue-300",
                    "mt-8 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
                  )}
                  onClick={() => {
                    if (tier.price.monthly !== "$0" && env.NEXT_PUBLIC_GTM_ID) {
                      sendGTMEvent({ event: "Begin checkout", value: 1 });
                    }
                  }}
                >
                  {isCurrentPlan ? "Current plan" : tier.cta}
                </a>
              </div>
            );
          })}
        </div>

        <LifetimePricing
          user={session.data?.user}
          affiliateCode={affiliateCode}
          premiumTier={premiumTier}
        />
      </div>
    </LoadingContent>
  );
}

function LifetimePricing(props: {
  user?: { id: string; email?: string | null; name?: string | null };
  affiliateCode: string | null;
  premiumTier?: PremiumTier | null;
}) {
  const { user, premiumTier, affiliateCode } = props;
  const hasLifetime = premiumTier === PremiumTier.LIFETIME;

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
                  {pricing.LIFETIME}
                </span>
                <span className="text-sm font-semibold leading-6 tracking-wide text-gray-600">
                  USD
                </span>
              </p>
              <a
                href={
                  user?.email
                    ? hasLifetime
                      ? "#"
                      : buildLemonUrl(
                          attachUserInfo(
                            env.NEXT_PUBLIC_LIFETIME_PAYMENT_LINK,
                            {
                              id: user.id,
                              email: user.email,
                              name: user.name,
                            },
                          ),
                          affiliateCode,
                        )
                    : "/login?next=/premium"
                }
                onClick={() => {
                  if (env.NEXT_PUBLIC_GTM_ID) {
                    sendGTMEvent({ event: "Begin checkout", value: 5 });
                  }
                }}
                target="_blank"
                className="mt-10 block w-full rounded-md bg-blue-600 px-3 py-2 text-center text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {hasLifetime ? "Current plan" : "Get lifetime access"}
              </a>
              <p className="mt-6 text-xs leading-5 text-gray-600">
                {pricingAdditonalEmail[PremiumTier.LIFETIME]} per additional
                email address
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
