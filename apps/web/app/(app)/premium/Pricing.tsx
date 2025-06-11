"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Label, Radio, RadioGroup } from "@headlessui/react";
import { CheckIcon, CreditCardIcon, SparklesIcon } from "lucide-react";
import { capitalCase } from "capital-case";
import Link from "next/link";
import { env } from "@/env";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { Button } from "@/components/ui/button";
import { getUserTier } from "@/utils/premium";
import {
  pricingAdditonalEmail,
  type Tier,
  tiers,
} from "@/app/(app)/premium/config";
import { AlertWithButton } from "@/components/Alert";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { toastError } from "@/components/Toast";
import {
  generateCheckoutSessionAction,
  getBillingPortalUrlAction,
} from "@/utils/actions/premium";
import type { PremiumTier } from "@prisma/client";
import { LoadingMiniSpinner } from "@/components/Loading";
import { cn } from "@/utils";

const frequencies = [
  { value: "monthly" as const, label: "Monthly", priceSuffix: "/month" },
  { value: "annually" as const, label: "Annually", priceSuffix: "/month" },
];

export type PricingProps = {
  header?: React.ReactNode;
  showSkipUpgrade?: boolean;
  className?: string;
};

export default function Pricing(props: PricingProps) {
  const { isPremium, premium, isLoading, error, data } = usePremium();

  const isLoggedIn = !!data?.id;

  // const defaultFrequency = usePricingFrequencyDefault();
  // const [frequency, setFrequency] = useState(
  //   defaultFrequency === "monthly" ? frequencies[0] : frequencies[1],
  // );
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

  // const pricingVariant = usePricingVariant();
  // const { Layout, Item, tiers } = getLayoutComponents(
  //   pricingVariant,
  //   premiumTier,
  // );

  // const pricingVariant = usePricingVariant();
  // const { Layout, Item, tiers } = getLayoutComponents(
  //   pricingVariant,
  //   premiumTier,
  // );

  // const { Layout, Item, tiers } = {
  //   Layout: ThreeColLayout,
  //   Item: ThreeColItem,
  //   tiers: [basicTier, businessTier, enterpriseTier],
  // };

  const Layout = TwoColLayout;

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
                <Button variant="primaryBlue" className="ml-2" asChild>
                  <Link href={env.NEXT_PUBLIC_APP_HOME_PATH}>
                    <SparklesIcon className="mr-2 h-4 w-4" />
                    Go to app
                  </Link>
                </Button>
                <div className="mx-auto mt-4 max-w-md">
                  <AlertWithButton
                    className="bg-background"
                    variant="blue"
                    title="Add extra users to your account!"
                    description={`You can upgrade extra accounts to ${capitalCase(
                      userPremiumTier,
                    )} for $${
                      pricingAdditonalEmail[userPremiumTier]
                    } per email address!`}
                    icon={null}
                    button={
                      <div className="ml-4 whitespace-nowrap">
                        <Button variant="primaryBlue" asChild>
                          {/* <Link href="/settings#manage-users">Add users</Link> */}
                          <Link href="/accounts">Add users</Link>
                        </Button>
                      </div>
                    }
                  />
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
            <Badge>Save up to 20%!</Badge>
          </div>
        </div>

        <Layout className="isolate mx-auto mt-10 grid max-w-md grid-cols-1 gap-y-8">
          {tiers.map((tier) => {
            return (
              <PriceTier
                key={tier.name}
                tier={tier}
                userPremiumTier={userPremiumTier}
                frequency={frequency}
                stripeSubscriptionId={premium?.stripeSubscriptionId}
                isLoggedIn={isLoggedIn}
                router={router}
              />
            );
          })}
        </Layout>
      </div>
    </LoadingContent>
  );
}

function PriceTier({
  tier,
  userPremiumTier,
  frequency,
  stripeSubscriptionId,
  isLoggedIn,
  router,
}: {
  tier: Tier;
  userPremiumTier: PremiumTier | null;
  frequency: (typeof frequencies)[number];
  stripeSubscriptionId: string | null | undefined;
  isLoggedIn: boolean;
  router: ReturnType<typeof useRouter>;
}) {
  const [loading, setLoading] = useState(false);

  const isCurrentPlan = tier.tiers[frequency.value] === userPremiumTier;

  function getCTAText() {
    if (isCurrentPlan) return "Current plan";
    if (userPremiumTier) return "Switch to this plan";
    return tier.cta;
  }

  return (
    <TwoColItem
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
          <span className="text-4xl font-bold tracking-tight text-gray-900">
            ${tier.price[frequency.value]}
          </span>
          <span className="text-sm font-semibold leading-6 text-gray-600">
            {frequency.priceSuffix}
          </span>

          {!!tier.discount?.[frequency.value] && (
            <Badge>
              <span className="tracking-wide">
                SAVE {tier.discount[frequency.value].toFixed(0)}%
              </span>
            </Badge>
          )}
        </p>
        {tier.priceAdditional ? (
          <p className="mt-3 text-sm leading-6 text-gray-500">
            +${formatPrice(tier.priceAdditional[frequency.value])} for each
            additional email account
          </p>
        ) : (
          <div className="mt-16" />
        )}
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
          if (!isLoggedIn) router.push("/login");

          setLoading(true);

          async function load() {
            if (tier.tiers[frequency.value] === userPremiumTier) {
              toast.info("You are already on this plan");
              return;
            }

            const upgradeToTier = tier.tiers[frequency.value];

            const result = stripeSubscriptionId
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
    </TwoColItem>
  );
}

// function attachUserInfo(
//   url: string,
//   user: { id: string; email: string; name?: string | null },
//   quantity?: number,
// ) {
//   if (!user) return url;

//   let res = `${url}?checkout[custom][user_id]=${user.id}&checkout[email]=${user.email}&checkout[name]=${user.name}`;
//   if (quantity) res += `&quantity=${quantity}`;
//   return res;
// }

// function useAffiliateCode() {
//   const searchParams = useSearchParams();
//   const affiliateCode = searchParams.get("aff");
//   return affiliateCode;
// }

// function buildLemonUrl(url: string, affiliateCode: string | null) {
//   if (!affiliateCode) return url;
//   const newUrl = `${url}?aff_ref=${affiliateCode}`;
//   return newUrl;
// }

// function getLayoutComponents(
//   pricingVariant: string,
//   premiumTier: PremiumTier | null,
// ) {
//   const isBasicTier =
//     premiumTier === PremiumTier.BASIC_MONTHLY ||
//     premiumTier === PremiumTier.BASIC_ANNUALLY;

//   if (pricingVariant === "basic-business" || isBasicTier) {
//     return {
//       Layout: TwoColLayout,
//       Item: TwoColItem,
//       tiers: [basicTier, businessTier],
//     };
//   }

//   if (pricingVariant === "business-basic" || isBasicTier) {
//     return {
//       Layout: TwoColLayout,
//       Item: TwoColItem,
//       tiers: [businessTier, basicTier],
//     };
//   }

//   // control
//   return {
//     Layout: ThreeColLayout,
//     Item: ThreeColItem,
//     tiers: [basicTier, businessTier, enterpriseTier],
//   };
// }

// function ThreeColLayout({
//   children,
//   className,
// }: {
//   children: React.ReactNode;
//   className?: string;
// }) {
//   return (
//     <div className={cn("lg:mx-0 lg:max-w-none lg:grid-cols-3", className)}>
//       {children}
//     </div>
//   );
// }

function TwoColLayout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("gap-x-4 lg:max-w-4xl lg:grid-cols-2", className)}>
      {children}
    </div>
  );
}

// function ThreeColItem({
//   children,
//   className,
//   index,
// }: {
//   children: React.ReactNode;
//   className?: string;
//   index: number;
// }) {
//   return (
//     <div
//       className={cn(
//         index === 1 ? "lg:z-10 lg:rounded-b-none" : "lg:mt-8", // middle tier
//         index === 0 ? "lg:rounded-r-none" : "",
//         index === 2 ? "lg:rounded-l-none" : "",
//         className,
//       )}
//     >
//       {children}
//     </div>
//   );
// }

function TwoColItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col justify-between", className)}>
      {children}
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-blue-600/10 px-2.5 py-1 text-xs font-semibold leading-5 text-blue-600">
      {children}
    </span>
  );
}

// $3 => $3
// $3.5 => $3.50
function formatPrice(price: number) {
  if (price - Math.floor(price) > 0) return price.toFixed(2);
  return price;
}

export function ManageSubscription({
  premium: { stripeSubscriptionId, lemonSqueezyCustomerId },
}: {
  premium: {
    stripeSubscriptionId: string | null | undefined;
    lemonSqueezyCustomerId: number | null | undefined;
  };
}) {
  const [loadingBillingPortal, setLoadingBillingPortal] = useState(false);

  const hasBothStripeAndLemon = !!(
    stripeSubscriptionId && lemonSqueezyCustomerId
  );

  return (
    <>
      {stripeSubscriptionId && (
        <Button
          loading={loadingBillingPortal}
          onClick={async () => {
            setLoadingBillingPortal(true);
            const result = await getBillingPortalUrlAction({});
            setLoadingBillingPortal(false);
            const url = result?.data?.url;
            if (result?.serverError || !url) {
              toastError({
                description:
                  result?.serverError ||
                  "Error loading billing portal. Please contact support.",
              });
            } else {
              window.location.href = url;
            }
          }}
        >
          <CreditCardIcon className="mr-2 h-4 w-4" />
          Manage{hasBothStripeAndLemon ? " Stripe" : ""} subscription
        </Button>
      )}

      {lemonSqueezyCustomerId && (
        <Button asChild>
          <Link
            href={`https://${env.NEXT_PUBLIC_LEMON_STORE_ID}.lemonsqueezy.com/billing`}
            target="_blank"
          >
            <CreditCardIcon className="mr-2 h-4 w-4" />
            Manage{hasBothStripeAndLemon ? " Lemon" : ""} subscription
          </Link>
        </Button>
      )}
    </>
  );
}
