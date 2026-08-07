"use client";

import { useState } from "react";
import { tiers, type Tier } from "@/app/(app)/premium/config";
import { ButtonLoader } from "@/components/Loading";
import { cn } from "@/utils";

// Short feature blurbs sized for the inline cards; the full feature lists live
// on the pricing page.
const TIER_BLURBS: Record<string, string> = {
  Starter: "Everything set up today",
  Plus: "2 accounts, Slack, meeting notes",
  Professional: "Priority support, onboarding help",
};

export function OnboardingPlanCards({
  onPick,
  disabled,
}: {
  onPick: (tier: Tier) => Promise<void>;
  disabled: boolean;
}) {
  const [pickedTier, setPickedTier] = useState<string | null>(null);

  const pick = async (tier: Tier) => {
    if (disabled || pickedTier) return;
    setPickedTier(tier.name);
    try {
      await onPick(tier);
    } finally {
      setPickedTier(null);
    }
  };

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row">
      {tiers.map((tier) => (
        <button
          key={tier.name}
          type="button"
          disabled={disabled || Boolean(pickedTier)}
          onClick={() => pick(tier)}
          className={cn(
            "relative flex-1 rounded-xl border bg-background p-4 text-left transition-colors",
            tier.mostPopular
              ? "border-blue-600 shadow-[0_2px_10px_rgba(75,131,253,0.14)]"
              : "hover:border-muted-foreground/40",
          )}
        >
          {tier.mostPopular && (
            <span className="absolute -top-2.5 left-3 rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
              Popular
            </span>
          )}
          <div className="flex items-center gap-2 text-sm font-semibold">
            {tier.name}
            {pickedTier === tier.name && <ButtonLoader />}
          </div>
          <div className="mb-0.5 mt-1 text-xl font-medium">
            ${tier.price.monthly}
            <span className="text-xs font-normal text-muted-foreground">
              {" "}
              /user/mo
            </span>
          </div>
          <div className="text-xs leading-snug text-muted-foreground">
            {TIER_BLURBS[tier.name] ?? tier.description}
          </div>
        </button>
      ))}
    </div>
  );
}
