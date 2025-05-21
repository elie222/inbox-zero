"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { adminChangePremiumStatusAction } from "@/utils/actions/premium";
import { Select } from "@/components/Select";
import {
  changePremiumStatusSchema,
  type ChangePremiumStatusOptions,
} from "@/app/(app)/admin/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PremiumTier } from "@prisma/client";
import { toastError, toastSuccess } from "@/components/Toast";

export const AdminUpgradeUserForm = () => {
  const { execute: changePremiumStatus, isExecuting } = useAction(
    adminChangePremiumStatusAction,
    {
      onSuccess: () => {
        toastSuccess({
          description: "Premium status changed",
        });
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
      period: PremiumTier.BUSINESS_ANNUALLY,
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
      <Select
        label="Plan"
        options={[
          {
            label: PremiumTier.BUSINESS_ANNUALLY,
            value: PremiumTier.BUSINESS_ANNUALLY,
          },
          {
            label: PremiumTier.BUSINESS_MONTHLY,
            value: PremiumTier.BUSINESS_MONTHLY,
          },
          {
            label: PremiumTier.BUSINESS_PLUS_ANNUALLY,
            value: PremiumTier.BUSINESS_PLUS_ANNUALLY,
          },
          {
            label: PremiumTier.BUSINESS_PLUS_MONTHLY,
            value: PremiumTier.BUSINESS_PLUS_MONTHLY,
          },
          {
            label: PremiumTier.PRO_ANNUALLY,
            value: PremiumTier.PRO_ANNUALLY,
          },
          {
            label: PremiumTier.PRO_MONTHLY,
            value: PremiumTier.PRO_MONTHLY,
          },
          {
            label: PremiumTier.BASIC_ANNUALLY,
            value: PremiumTier.BASIC_ANNUALLY,
          },
          {
            label: PremiumTier.BASIC_MONTHLY,
            value: PremiumTier.BASIC_MONTHLY,
          },
          {
            label: PremiumTier.COPILOT_MONTHLY,
            value: PremiumTier.COPILOT_MONTHLY,
          },
        ]}
        {...register("period")}
        error={errors.period}
      />
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
              period: getValues("period"),
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
              period: getValues("period"),
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
