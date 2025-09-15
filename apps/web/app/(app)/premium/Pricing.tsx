"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Label, Radio, RadioGroup } from "@headlessui/react";
import { CheckIcon, SparklesIcon } from "lucide-react";
import Link from "next/link";
import { env } from "@/env";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { getUserTier } from "@/utils/premium";
import { type Tier, tiers } from "@/app/(app)/premium/config";
import { AlertWithButton } from "@/components/Alert";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { toastError } from "@/components/Toast";
import {
  generateCheckoutSessionAction,
  getBillingPortalUrlAction,
} from "@/utils/actions/premium";
import { PremiumTier } from "@/generated/prisma";
import { LoadingMiniSpinner } from "@/components/Loading";
import { cn } from "@/utils";
import { ManageSubscription } from "@/app/(app)/premium/ManageSubscription";

const frequencies = [
  {
    value: "monthly" as const,
    label: "Monthly",
    priceSuffix: "/month, billed monthly",
  },
  {
    value: "annually" as const,
    label: "Annually",
    priceSuffix: "/month, billed annually",
  },
];

export type PricingProps = {
  header?: React.ReactNode;
  showSkipUpgrade?: boolean;
  className?: string;
};

export default function Pricing(props: PricingProps) {
  const { premium, isLoading, error, data } = usePremium();

  const isLoggedIn = !!data?.id;

  const [frequency, setFrequency] = useState(frequencies[1]);

  const userPremiumTier = getUserTier(premium);

  const header = props.header || (
    <div className="mb-12">
      <div className="mx-auto max-w-2xl text-center lg:max-w-4xl">
        <h2 className="font-cal text-base leading-7 text-blue-600">Pricing</h2>
        <p className="mt-2 font-cal text-4xl text-gray-900 sm:text-5xl">
          Try for free, affordable paid plans
        </p>
      </div>
      <p className="mx-auto mt-6 max-w-2xl text-center text-lg leading-8 text-gray-600">
        No hidden fees. Cancel anytime.
      </p>
    </div>
  );

  const router = useRouter();

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

        {!!(
          premium?.stripeSubscriptionId || premium?.lemonSqueezyCustomerId
        ) && (
          <div className="mb-8 mt-8 text-center">
            <ManageSubscription premium={premium} />

            {userPremiumTier && (
              <>
                <Button className="ml-2" asChild>
                  <Link href={env.NEXT_PUBLIC_APP_HOME_PATH}>
                    <SparklesIcon className="mr-2 h-4 w-4" />
                    Go to app
                  </Link>
                </Button>
                <div className="mx-auto mt-4 max-w-md">
                  {userPremiumTier === PremiumTier.BUSINESS_MONTHLY ||
                  userPremiumTier === PremiumTier.BUSINESS_ANNUALLY ? (
                    <AlertWithButton
                      className="bg-background"
                      variant="blue"
                      title="Need multiple accounts?"
                      description="Individual plans are designed for single users. Contact our support team for custom pricing on multiple accounts."
                      icon={null}
                      button={
                        <div className="ml-4 whitespace-nowrap">
                          <Button asChild>
                            <Link href="/support">Contact Support</Link>
                          </Button>
                        </div>
                      }
                    />
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-center">
          <RadioGroup
            value={frequency}
            onChange={setFrequency}
            className="grid grid-cols-2 gap-x-1 rounded-full p-1 text-center text-xs font-semibold leading-5 ring-1 ring-inset ring-gray-200"
          >
            <Label className="sr-only">Payment frequency</Label>
            {frequencies.map((option) => (
              <Radio
                key={option.value}
                value={option}
                className={({ checked }) =>
                  cn(
                    checked ? "bg-black text-white" : "text-gray-500",
                    "cursor-pointer rounded-full px-2.5 py-1",
                  )
                }
              >
                <span>{option.label}</span>
              </Radio>
            ))}
          </RadioGroup>

          <div className="ml-1">
            <Badge>Save up to 16%</Badge>
          </div>
        </div>

        <div className="isolate mx-auto mt-10 grid max-w-7xl grid-cols-1 gap-y-8 lg:mx-0 lg:max-w-none lg:grid-cols-3 gap-4">
          {tiers.map((tier) => {
            return (
              <PriceTier
                key={tier.name}
                tier={tier}
                userPremiumTier={userPremiumTier}
                frequency={frequency}
                stripeSubscriptionId={premium?.stripeSubscriptionId}
                stripeSubscriptionStatus={premium?.stripeSubscriptionStatus}
                isLoggedIn={isLoggedIn}
                router={router}
              />
            );
          })}
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
  isLoggedIn,
  router,
}: {
  tier: Tier;
  userPremiumTier: PremiumTier | null;
  frequency: (typeof frequencies)[number];
  stripeSubscriptionId: string | null | undefined;
  stripeSubscriptionStatus: string | null | undefined;
  isLoggedIn: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [loading, setLoading] = useState(false);

  const isCurrentPlan = tier.tiers[frequency.value] === userPremiumTier;

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
              "font-cal text-lg leading-8",
            )}
          >
            {tier.name}
          </h3>
          {tier.mostPopular ? <Badge>Popular</Badge> : null}
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
            <Badge>
              <span className="tracking-wide">
                SAVE {tier.discount[frequency.value].toFixed(0)}%
              </span>
            </Badge>
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
          // Handle enterprise tier differently - redirect to sales page
          if (tier.ctaLink) {
            window.location.href = tier.ctaLink;
            return;
          }

          if (!isLoggedIn) router.push("/login");

          setLoading(true);

          async function load() {
            if (tier.tiers[frequency.value] === userPremiumTier) {
              toast.info("You are already on this plan");
              return;
            }

            const upgradeToTier = tier.tiers[frequency.value];

            // Only use billing portal if subscription is active or trialing
            const hasActiveStripeSubscription =
              stripeSubscriptionId &&
              stripeSubscriptionStatus &&
              ["active", "trialing"].includes(stripeSubscriptionStatus);

            const result = hasActiveStripeSubscription
              ? await getBillingPortalUrlAction({
                  tier: upgradeToTier,
                })
              : await generateCheckoutSessionAction({
                  tier: upgradeToTier,
                });

            if (!result?.data?.url || result?.serverError) {
              toastError({
                description:
                  result?.serverError ||
                  "Error creating checkout session. Please contact support.",
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

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-blue-600/10 px-2.5 py-1 text-xs font-semibold leading-5 text-blue-600">
      {children}
    </span>
  );
}
