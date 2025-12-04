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
      period: "BUSINESS_ANNUALLY",
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
            label: "BUSINESS_ANNUALLY",
            value: "BUSINESS_ANNUALLY",
          },
          {
            label: "BUSINESS_MONTHLY",
            value: "BUSINESS_MONTHLY",
          },
          {
            label: "BUSINESS_PLUS_ANNUALLY",
            value: "BUSINESS_PLUS_ANNUALLY",
          },
          {
            label: "BUSINESS_PLUS_MONTHLY",
            value: "BUSINESS_PLUS_MONTHLY",
          },
          {
            label: "PRO_ANNUALLY",
            value: "PRO_ANNUALLY",
          },
          {
            label: "PRO_MONTHLY",
            value: "PRO_MONTHLY",
          },
          {
            label: "BASIC_ANNUALLY",
            value: "BASIC_ANNUALLY",
          },
          {
            label: "BASIC_MONTHLY",
            value: "BASIC_MONTHLY",
          },
          {
            label: "COPILOT_MONTHLY",
            value: "COPILOT_MONTHLY",
          },
          {
            label: "LIFETIME",
            value: "LIFETIME",
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
