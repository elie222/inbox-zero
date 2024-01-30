"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isErrorMessage } from "@/utils/error";
import { changePremiumStatus } from "@/utils/actions";
import { Select } from "@/components/Select";
import {
  changePremiumStatusSchema,
  type ChangePremiumStatusOptions,
} from "@/app/(app)/admin/validation";
import { zodResolver } from "@hookform/resolvers/zod";
import { PremiumTier } from "@prisma/client";

export const UpgradeToAdminForm = () => {
  const {
    register,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<ChangePremiumStatusOptions>({
    resolver: zodResolver(changePremiumStatusSchema),
    defaultValues: {
      period: PremiumTier.BUSINESS_ANNUALLY,
    },
  });

  const onSubmit: SubmitHandler<ChangePremiumStatusOptions> = useCallback(
    async (data) => {
      try {
        const res = await changePremiumStatus(data);
        if (isErrorMessage(res)) toastError({ description: res.data });
        else
          toastSuccess({
            description: data.upgrade ? `Upgraded!` : `Downgraded!`,
          });
      } catch (error: any) {
        toastError({ description: error?.message || "Error" });
      }
    },
    [],
  );

  return (
    <form className="max-w-sm space-y-4">
      <Input
        type="text"
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
      <Select<PremiumTier>
        name="period"
        label="Period"
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
            label: PremiumTier.PRO_ANNUALLY,
            value: PremiumTier.PRO_ANNUALLY,
          },
          {
            label: PremiumTier.PRO_MONTHLY,
            value: PremiumTier.PRO_MONTHLY,
          },
          {
            label: PremiumTier.LIFETIME,
            value: PremiumTier.LIFETIME,
          },
        ]}
        registerProps={register("period")}
        error={errors.period}
      />
      <div className="space-x-2">
        <Button
          type="button"
          loading={isSubmitting}
          onClick={() => {
            onSubmit({
              email: getValues("email"),
              lemonSqueezyCustomerId: getValues("lemonSqueezyCustomerId"),
              period: getValues("period"),
              upgrade: true,
            });
          }}
        >
          Upgrade
        </Button>
        <Button
          type="button"
          loading={isSubmitting}
          color="red"
          onClick={() => {
            onSubmit({
              email: getValues("email"),
              period: getValues("period"),
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
