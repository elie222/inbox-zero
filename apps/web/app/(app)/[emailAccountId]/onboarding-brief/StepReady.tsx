"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  CheckIcon,
  ChevronRightIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { PageHeading, TypographyP } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { CardBasic } from "@/components/ui/card";
import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { getGmailBasicSearchUrl } from "@/utils/url";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import {
  PricingFrequencyToggle,
  frequencies,
  DiscountBadge,
} from "@/app/(app)/premium/PricingFrequencyToggle";
import {
  BRIEF_MY_MEETING_PRICE_ID_MONTHLY,
  BRIEF_MY_MEETING_PRICE_ID_ANNUALLY,
} from "@/app/(app)/premium/config";
import { generateCheckoutSessionAction } from "@/utils/actions/premium";
import { toastError } from "@/components/Toast";

const PRICING_FEATURES = [
  "Briefs for every external meeting",
  "Google Calendar & Outlook",
  "LinkedIn & web research",
  "Sent 1-24 hours before (you choose)",
];

export function StepReady() {
  const { emailAccount } = useAccount();
  const [frequency, setFrequency] = useState(frequencies[1]);
  const [loading, setLoading] = useState(false);

  async function handleCheckout() {
    setLoading(true);
    try {
      const tier =
        frequency.value === "annually"
          ? "BUSINESS_ANNUALLY"
          : "BUSINESS_MONTHLY";
      const priceId =
        frequency.value === "annually"
          ? BRIEF_MY_MEETING_PRICE_ID_ANNUALLY
          : BRIEF_MY_MEETING_PRICE_ID_MONTHLY;

      const result = await generateCheckoutSessionAction({ tier, priceId });

      if (!result?.data?.url) {
        toastError({ description: "Error creating checkout session" });
        return;
      }

      window.location.href = result.data.url;
    } catch {
      toastError({ description: "Error creating checkout session" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex justify-center">
        <IconCircle size="lg">
          <Sparkles className="size-6" />
        </IconCircle>
      </div>

      <div className="text-center">
        <PageHeading className="mt-4">
          Ready to walk into every meeting prepared?
        </PageHeading>
        <TypographyP className="mt-2 max-w-lg mx-auto">
          You'll get a brief like this before every external meeting,
          automatically.
        </TypographyP>
      </div>

      <div className="mt-8 flex flex-col items-center">
        <PricingFrequencyToggle
          frequency={frequency}
          setFrequency={setFrequency}
        >
          <div className="ml-1">
            <DiscountBadge>2 months free!</DiscountBadge>
          </div>
        </PricingFrequencyToggle>

        <CardBasic className="mt-4 p-6 w-full">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Meeting Briefs Pro
              </p>
              <p className="text-3xl font-bold text-foreground mt-1">
                ${frequency.value === "annually" ? "7.50" : "9"}
                <span className="text-base font-normal text-muted-foreground">
                  /month
                </span>
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {frequency.value === "annually"
                  ? "billed annually ($90/year)"
                  : "billed monthly"}
              </p>
            </div>
            <div className="rounded-full border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-semibold text-green-700">
              7-day free trial
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {PRICING_FEATURES.map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-50">
                  <CheckIcon className="h-3 w-3 text-green-600" />
                </div>
                <span className="text-foreground">{feature}</span>
              </div>
            ))}
          </div>
        </CardBasic>
      </div>

      <div className="flex flex-col gap-3 mt-8">
        <Button
          size="lg"
          className="w-full"
          onClick={handleCheckout}
          loading={loading}
        >
          Start Free Trial
          <ChevronRightIcon className="ml-2 h-4 w-4" />
        </Button>

        {emailAccount?.email &&
          isGoogleProvider(emailAccount?.account?.provider) && (
            <Button variant="outline" size="lg" className="w-full" asChild>
              <Link
                href={getGmailBasicSearchUrl(
                  emailAccount.email,
                  "from:(getinboxzero.com) subject:(Briefing for)",
                )}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon className="mr-2 h-4 w-4" />
                View test brief in Gmail
              </Link>
            </Button>
          )}
      </div>
    </>
  );
}
