"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { CheckIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import { env } from "@/env";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/hooks/usePremium";
import { Button } from "@/components/ui/button";
import {
  PricingFrequencyToggle,
  frequencies,
  DiscountBadge,
  type Frequency,
} from "@/app/(app)/premium/PricingFrequencyToggle";
import { getUserTier, hasActiveAppleSubscription } from "@/utils/premium";
import {
  getPremiumTierName,
  shouldShowLegacyStripePricingNotice,
  type Tier,
  tiers,
} from "@/app/(app)/premium/config";
import { AlertBasic } from "@/components/Alert";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { toastError } from "@/components/Toast";
import {
  generateCheckoutSessionAction,
  getBillingPortalUrlAction,
} from "@/utils/actions/premium";
import type { PremiumTier } from "@/generated/prisma/enums";
import { LoadingMiniSpinner } from "@/components/Loading";
import { cn } from "@/utils";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";
import { captureException } from "@/utils/error";

export type PricingProps = {
  header?: React.ReactNode;
  showSkipUpgrade?: boolean;
  className?: string;
  displayTiers?: Tier[];
};

export default function Pricing(props: PricingProps) {
  const posthog = usePostHog();
  const { premium, isPremium, isLoading, error, data } = usePremium();
  const hasTrackedPricingView = useRef(false);

  const isLoggedIn = !!data?.id;
  const pricingSource = props.showSkipUpgrade
    ? "welcome_upgrade"
    : "app_premium";
  const displayedTiers = props.displayTiers || tiers;
  const hasActiveAppleManagedSubscription = hasActiveAppleSubscription(
    premium?.appleExpiresAt || null,
    premium?.appleRevokedAt || null,
    premium?.appleSubscriptionStatus || null,
  );
  const hasExistingSubscription = Boolean(
    isPremium ||
      premium?.stripeSubscriptionId ||
      premium?.lemonSqueezyCustomerId ||
      hasActiveAppleManagedSubscription,
  );
  const isLegacyStripePlan = shouldShowLegacyStripePricingNotice(premium);

  const [frequency, setFrequency] = useState(frequencies[1]);

  const userPremiumTier = getUserTier(premium);

  const header = props.header || (
    <div className="mb-12">
      <div className="mx-auto max-w-2xl text-center lg:max-w-4xl">
        <h2 className="font-title text-base leading-7 text-blue-600">
          Pricing
        </h2>
        <p className="mt-2 font-title text-4xl text-gray-900 sm:text-5xl">
          Try for free, affordable paid plans
        </p>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600">
        No hidden fees. Cancel anytime.
      </p>
    </div>
  );

  const router = useRouter();

  useEffect(() => {
    if (isLoading || hasTrackedPricingView.current) return;

    hasTrackedPricingView.current = true;
    posthog.capture("pricing_page_viewed", {
      source: pricingSource,
      isLoggedIn,
      hasExistingSubscription,
      showSkipUpgrade: Boolean(props.showSkipUpgrade),
      displayedTiers: displayedTiers.map((tier) => tier.name),
    });
  }, [
    displayedTiers,
    hasExistingSubscription,
    isLoading,
    isLoggedIn,
    posthog,
    pricingSource,
    props.showSkipUpgrade,
  ]);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div
        id="pricing"
        className={cn(
          "relative isolate mx-auto max-w-7xl bg-white px-6 pt-10 lg:px-8",
          props.className,
        )}
      >
        {header}

        {hasExistingSubscription && (
          <div className="mb-8 mt-8 text-center">
            <ManageSubscription premium={premium ?? null} />

            {userPremiumTier && (
              <Button className="ml-2" asChild>
                <Link href="/setup">
                  <SparklesIcon className="mr-2 h-4 w-4" />
                  Go to app
                </Link>
              </Button>
            )}

            {hasActiveAppleManagedSubscription && (
              <div className="mx-auto mt-4 max-w-2xl text-left">
                <AlertBasic
                  variant="blue"
                  title="Managed in the App Store"
                  description="This subscription is billed by Apple. To change or cancel it, use your iPhone or iPad subscription settings."
                />
              </div>
            )}

            {isLegacyStripePlan && (
              <div className="mx-auto mt-4 max-w-2xl text-left">
                <AlertBasic
                  variant="blue"
                  title="Grandfathered pricing"
                  description={`You're on a legacy ${getPremiumTierName(premium?.tier)} Stripe plan. The prices below are the current rates for new subscriptions and may be higher than your actual billing.`}
                />
              </div>
            )}
          </div>
        )}

        <PricingFrequencyToggle
          frequency={frequency}
          setFrequency={setFrequency}
        >
          <div className="ml-1">
            <DiscountBadge>Save up to 20%</DiscountBadge>
          </div>
        </PricingFrequencyToggle>

        <div
          className={cn(
            "isolate mx-auto mt-10 grid grid-cols-1 gap-y-8 gap-4",
            displayedTiers.length === 2
              ? "max-w-3xl lg:grid-cols-2"
              : "max-w-7xl lg:mx-0 lg:max-w-none lg:grid-cols-3",
          )}
        >
          {displayedTiers.map((tier) => (
            <PriceTier
              key={tier.name}
              tier={tier}
              userPremiumTier={userPremiumTier}
              frequency={frequency}
              stripeSubscriptionId={premium?.stripeSubscriptionId}
              stripeSubscriptionStatus={premium?.stripeSubscriptionStatus}
              hasActiveAppleManagedSubscription={
                hasActiveAppleManagedSubscription
              }
              isLoggedIn={isLoggedIn}
              router={router}
              userId={data?.id}
              pricingSource={pricingSource}
            />
          ))}
        </div>
      </div>
    </LoadingContent>
  );
}

function PriceTier({
  tier,
  userPremiumTier,
  frequency,
  stripeSubscriptionId,
  stripeSubscriptionStatus,
  hasActiveAppleManagedSubscription,
  isLoggedIn,
  router,
  userId,
  pricingSource,
}: {
  tier: Tier;
  userPremiumTier: PremiumTier | null;
  frequency: Frequency;
  stripeSubscriptionId: string | null | undefined;
  stripeSubscriptionStatus: string | null | undefined;
  hasActiveAppleManagedSubscription: boolean;
  isLoggedIn: boolean;
  router: ReturnType<typeof useRouter>;
  userId: string | null | undefined;
  pricingSource: "welcome_upgrade" | "app_premium";
}) {
  const posthog = usePostHog();
  const [loading, setLoading] = useState(false);

  const isCurrentPlan = tier.tiers[frequency.value] === userPremiumTier;
  const hasActiveStripeSubscription =
    !!stripeSubscriptionId &&
    !!stripeSubscriptionStatus &&
    ["active", "trialing"].includes(stripeSubscriptionStatus);

  function getCTAText() {
    if (isCurrentPlan) return "Current plan";
    if (userPremiumTier && !tier.ctaLink) return "Switch to this plan";
    return tier.cta;
  }

  return (
    <ThreeColItem
      key={tier.name}
      className="flex flex-col rounded-3xl bg-white p-8 ring-1 ring-gray-200 xl:p-10"
    >
      <div className="flex-1">
        <div className="flex items-center justify-between gap-x-4">
          <h3
            id={tier.name}
            className={cn(
              tier.mostPopular ? "text-blue-600" : "text-gray-900",
              "font-title text-lg leading-8",
            )}
          >
            {tier.name}
          </h3>
          {tier.mostPopular ? <DiscountBadge>Popular</DiscountBadge> : null}
        </div>
        <p className="mt-4 text-sm leading-6 text-gray-600">
          {tier.description}
        </p>
        <p className="mt-6 flex items-baseline gap-x-1">
          {tier.price[frequency.value] === 0 ? (
            <span className="text-4xl font-bold tracking-tight text-gray-900">
              Let's talk
            </span>
          ) : (
            <>
              <span className="text-4xl font-bold tracking-tight text-gray-900">
                ${tier.price[frequency.value]}
              </span>
              <span className="text-sm font-semibold leading-6 text-gray-600">
                /user
              </span>
            </>
          )}

          {!!tier.discount?.[frequency.value] && (
            <DiscountBadge>
              <span className="tracking-wide">
                SAVE {tier.discount[frequency.value].toFixed(0)}%
              </span>
            </DiscountBadge>
          )}
        </p>

        <p className="mt-2 text-sm leading-6 text-gray-600">
          {tier.price[frequency.value] ? frequency.priceSuffix : "\u00A0"}
        </p>

        <ul className="mt-8 space-y-3 text-sm leading-6 text-gray-600">
          {tier.features.map((feature) => (
            <li key={feature.text} className="flex gap-x-3">
              <CheckIcon
                className="h-6 w-5 flex-none text-blue-600"
                aria-hidden="true"
              />
              <span className="flex items-center gap-2">
                {feature.text}
                {feature.tooltip && (
                  <TooltipExplanation text={feature.tooltip} />
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <button
        type="button"
        disabled={loading}
        onClick={async () => {
          const upgradeToTier = tier.tiers[frequency.value];

          posthog.capture("pricing_cta_clicked", {
            source: pricingSource,
            tier: tier.name,
            billingTier: upgradeToTier ?? null,
            frequency: frequency.value,
            cta: getCTAText(),
            isCurrentPlan,
            isLoggedIn,
            hasExternalCta: Boolean(tier.ctaLink),
            hasActiveStripeSubscription,
          });

          // Handle enterprise tier differently - redirect to sales page
          if (tier.ctaLink) {
            window.location.href = tier.ctaLink;
            return;
          }

          if (!isLoggedIn) {
            router.push("/login");
            return;
          }

          setLoading(true);

          async function load() {
            if (tier.tiers[frequency.value] === userPremiumTier) {
              toast.info("You are already on this plan");
              return;
            }

            if (hasActiveAppleManagedSubscription) {
              toast.info(
                "This subscription is managed through the App Store. To change or cancel it, use your iPhone or iPad subscription settings.",
              );
              return;
            }

            let result:
              | Awaited<ReturnType<typeof getBillingPortalUrlAction>>
              | Awaited<ReturnType<typeof generateCheckoutSessionAction>>;

            if (hasActiveStripeSubscription) {
              result = await getBillingPortalUrlAction({ tier: upgradeToTier });

              if (!result?.data?.url) {
                result = await generateCheckoutSessionAction({
                  tier: upgradeToTier,
                });
              }
            } else {
              result = await generateCheckoutSessionAction({
                tier: upgradeToTier,
              });
            }

            if (!result?.data?.url || result?.serverError) {
              captureException(new Error("Error creating checkout session"), {
                extra: {
                  tier: upgradeToTier,
                  frequency: frequency.value,
                  userId,
                  serverError: result?.serverError,
                  result,
                },
              });
              toastError({
                description:
                  result?.serverError ||
                  `Error creating checkout session. Please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`,
              });
              return;
            }

            window.location.href = result.data.url;
          }

          try {
            await load();
          } catch (error) {
            console.error(error);
            toastError({
              description:
                error instanceof Error
                  ? error.message
                  : `Error creating checkout session. Please contact support at ${env.NEXT_PUBLIC_SUPPORT_EMAIL}`,
            });
          } finally {
            setLoading(false);
          }
        }}
        aria-describedby={tier.name}
        className={cn(
          tier.mostPopular
            ? "bg-blue-600 text-white shadow-sm hover:bg-blue-500"
            : "text-blue-600 ring-1 ring-inset ring-blue-200 hover:ring-blue-300",
          "mt-8 block rounded-md px-3 py-2 text-center text-sm font-semibold leading-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600",
        )}
      >
        {loading ? (
          <div className="flex items-center justify-center py-1">
            <LoadingMiniSpinner />
          </div>
        ) : (
          getCTAText()
        )}
      </button>
    </ThreeColItem>
  );
}

function ThreeColItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(className)}>{children}</div>;
}
