"use client";

import { useState } from "react";
import Link from "next/link";
import { XIcon, CreditCardIcon, AlertTriangleIcon } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import { isPremium } from "@/utils/premium";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/utils";

interface PremiumData {
  lemonSqueezyRenewsAt?: Date | string | null;
  stripeSubscriptionStatus?: string | null;
  stripeSubscriptionId?: string | null;
  lemonSqueezySubscriptionId?: number | string | null;
  tier?: string | null;
}

interface PremiumExpiredCardProps {
  premium: PremiumData | null | undefined;
  onDismiss?: () => void;
}

export function PremiumExpiredCardContent({
  premium,
  onDismiss,
}: PremiumExpiredCardProps) {
  // Early return if no premium data
  if (!premium) return null;

  // Convert string dates to Date objects if needed
  const lemonSqueezyRenewsAt = premium.lemonSqueezyRenewsAt
    ? typeof premium.lemonSqueezyRenewsAt === "string"
      ? new Date(premium.lemonSqueezyRenewsAt)
      : premium.lemonSqueezyRenewsAt
    : null;

  const isUserPremium = isPremium(
    lemonSqueezyRenewsAt,
    premium.stripeSubscriptionStatus || null,
  );

  if (isUserPremium) return null;

  // Determine the message based on subscription state
  const getSubscriptionMessage = () => {
    const status = premium.stripeSubscriptionStatus;
    const hasLemonSqueezyExpired =
      lemonSqueezyRenewsAt && lemonSqueezyRenewsAt < new Date();

    if (status === "past_due") {
      return {
        title: "Payment Past Due",
        description: "Update your payment method to continue service",
      };
    }

    if (status === "canceled" || status === "cancelled") {
      return {
        title: "Subscription Cancelled",
        description: "Reactivate to resume AI email management",
      };
    }

    if (status === "incomplete" || status === "incomplete_expired") {
      return {
        title: "Payment Incomplete",
        description: "Complete your payment to activate service",
      };
    }

    if (status === "unpaid") {
      return {
        title: "Payment Required",
        description: "Update payment to continue AI features",
      };
    }

    if (hasLemonSqueezyExpired || status === "expired") {
      return {
        title: "Subscription Expired",
        description: "Renew your subscription to continue",
      };
    }

    // Default fallback
    return {
      title: "Subscription Issue",
      description: "Please check your subscription status",
    };
  };

  const { title, description } = getSubscriptionMessage();

  return (
    <Card
      className={cn(
        "border-orange-200 bg-gradient-to-tr from-transparent via-orange-50/80 to-orange-500/15 shadow-sm",
        "dark:border-orange-900 dark:from-orange-950/50 dark:via-orange-900/20 dark:to-orange-800/10",
      )}
    >
      <div className="p-3">
        <div className="flex items-start gap-2">
          <AlertTriangleIcon className="h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-orange-800 dark:text-orange-200 leading-tight">
              {title}
            </p>
            <p className="text-xs text-orange-700/80 dark:text-orange-300/80 mt-1">
              {description}
            </p>
          </div>

          {onDismiss && (
            <button
              type="button"
              className="flex-shrink-0 rounded p-1 text-orange-600 hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-300 transition-colors dark:text-orange-400 dark:hover:bg-orange-900/20 dark:focus:ring-orange-700"
              onClick={onDismiss}
              aria-label="Dismiss banner"
            >
              <XIcon className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mt-3">
          <Button
            asChild
            size="sm"
            className="w-full bg-orange-600 text-white hover:bg-orange-700 border-0 shadow-sm h-8"
          >
            <Link
              href="/settings"
              className="flex items-center justify-center gap-1.5"
            >
              <CreditCardIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Reactivate</span>
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

export function PremiumExpiredCard() {
  const [dismissed, setDismissed] = useState(false);
  const { data: user, isLoading } = useUser();

  if (isLoading || dismissed || !user) return null;

  return (
    <div className="px-3 pt-4">
      <PremiumExpiredCardContent
        // premium={user.premium}
        premium={{
          stripeSubscriptionStatus: "past_due",
        }}
        onDismiss={() => setDismissed(true)}
      />
    </div>
  );
}
