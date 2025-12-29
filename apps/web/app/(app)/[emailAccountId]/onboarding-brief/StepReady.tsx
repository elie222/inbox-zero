"use client";

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

const PRICING_FEATURES = [
  "Briefs for every external meeting",
  "Google Calendar & Outlook",
  "LinkedIn & web research",
  "Sent 1-24 hours before (you choose)",
];

export function StepReady({ onNext }: { onNext: () => void }) {
  const { emailAccount } = useAccount();
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

      <CardBasic className="mt-8 p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Meeting Briefs Pro
            </p>
            <p className="text-2xl font-bold text-foreground mt-1">
              $9
              <span className="text-base font-normal text-muted-foreground">
                /month
              </span>
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

      <div className="flex flex-col gap-3 mt-8">
        <Button onClick={onNext} size="lg" className="w-full">
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
