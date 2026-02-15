"use client";

import { useCallback, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { type SubmitHandler, useForm } from "react-hook-form";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { Label } from "@/components/Input";
import { adminChangePremiumStatusAction } from "@/utils/actions/premium";
import {
  changePremiumStatusSchema,
  type ChangePremiumStatusOptions,
} from "@/app/(app)/admin/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { toastError, toastSuccess } from "@/components/Toast";
import type { PremiumTier } from "@/generated/prisma/enums";
import { tiers } from "@/app/(app)/premium/config";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils";

type TierKey = "STARTER" | "PLUS" | "PROFESSIONAL" | "LIFETIME";

const tierOptions: { key: TierKey; name: string; features: string }[] = [
  ...tiers.map((t) => ({
    key: t.tiers.annually.replace("_ANNUALLY", "") as TierKey,
    name: t.name,
    features: t.features.map((f) => f.text).join(", "),
  })),
  { key: "LIFETIME", name: "Lifetime", features: "One-time purchase" },
];

function buildPremiumTier(
  tierKey: TierKey,
  billingPeriod: "MONTHLY" | "ANNUALLY",
): PremiumTier {
  if (tierKey === "LIFETIME") return "LIFETIME";
  return `${tierKey}_${billingPeriod}` as PremiumTier;
}

export const AdminUpgradeUserForm = () => {
  const [selectedTier, setSelectedTier] = useState<TierKey>("STARTER");
  const [billingPeriod, setBillingPeriod] = useState<"MONTHLY" | "ANNUALLY">(
    "ANNUALLY",
  );

  const { execute: changePremiumStatus, isExecuting } = useAction(
    adminChangePremiumStatusAction,
    {
      onSuccess: () => {
        toastSuccess({ description: "Premium status changed" });
      },
      onError: ({ error }) => {
        toastError({
          description: `Error changing premium status: ${error.serverError}`,
        });
      },
    },
  );

  const {
    register,
    formState: { errors },
    getValues,
  } = useForm<ChangePremiumStatusOptions>({
    resolver: zodResolver(changePremiumStatusSchema),
    defaultValues: {
      period: "STARTER_ANNUALLY",
    },
  });

  const onSubmit: SubmitHandler<ChangePremiumStatusOptions> = useCallback(
    (data) => {
      changePremiumStatus({
        ...data,
        count: data.count || 1,
        lemonSqueezyCustomerId: data.lemonSqueezyCustomerId || undefined,
        emailAccountsAccess: data.emailAccountsAccess || undefined,
      });
    },
    [changePremiumStatus],
  );

  const period = buildPremiumTier(selectedTier, billingPeriod);

  return (
    <form className="max-w-sm space-y-4">
      <Input
        type="email"
        name="email"
        label="Email"
        registerProps={register("email", { required: true })}
        error={errors.email}
      />
      <Input
        type="number"
        name="lemonSqueezyCustomerId"
        label="Lemon Squeezy Customer Id"
        registerProps={register("lemonSqueezyCustomerId", {
          valueAsNumber: true,
        })}
        error={errors.lemonSqueezyCustomerId}
      />
      <Input
        type="number"
        name="emailAccountsAccess"
        label="Seats"
        registerProps={register("emailAccountsAccess", { valueAsNumber: true })}
        error={errors.emailAccountsAccess}
      />

      <div>
        <Label name="plan" label="Plan" />
        <Select
          value={selectedTier}
          onValueChange={(v) => setSelectedTier(v as TierKey)}
        >
          <SelectTrigger className="mt-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {tierOptions.map((tier) => (
              <SelectPrimitive.Item
                key={tier.key}
                value={tier.key}
                className="relative flex w-full cursor-default select-none items-start rounded-sm py-2 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                <span className="absolute left-2 top-2.5 flex h-3.5 w-3.5 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="h-4 w-4" />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <div>
                  <SelectPrimitive.ItemText>
                    {tier.name}
                  </SelectPrimitive.ItemText>
                  <div className="text-xs text-muted-foreground">
                    {tier.features}
                  </div>
                </div>
              </SelectPrimitive.Item>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedTier !== "LIFETIME" && (
        <div>
          <Label name="billingPeriod" label="Billing period" />
          <div className="mt-1 flex gap-1 rounded-md border border-input p-1">
            {(["MONTHLY", "ANNUALLY"] as const).map((bp) => (
              <button
                key={bp}
                type="button"
                onClick={() => setBillingPeriod(bp)}
                className={cn(
                  "flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors",
                  billingPeriod === bp
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {bp === "MONTHLY" ? "Monthly" : "Annual"}
              </button>
            ))}
          </div>
        </div>
      )}

      <Input
        type="number"
        name="count"
        label="Months/Years"
        registerProps={register("count", { valueAsNumber: true })}
        error={errors.count}
      />
      <div className="space-x-2">
        <Button
          type="button"
          loading={isExecuting}
          onClick={() => {
            onSubmit({
              email: getValues("email"),
              lemonSqueezyCustomerId: getValues("lemonSqueezyCustomerId"),
              emailAccountsAccess: getValues("emailAccountsAccess"),
              period,
              count: getValues("count"),
              upgrade: true,
            });
          }}
        >
          Upgrade
        </Button>
        <Button
          type="button"
          variant="destructive"
          loading={isExecuting}
          onClick={() => {
            onSubmit({
              email: getValues("email"),
              period,
              count: getValues("count"),
              upgrade: false,
            });
          }}
        >
          Downgrade
        </Button>
      </div>
    </form>
  );
};
