"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { TopSection } from "@/components/TopSection";
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

export default function AdminPage() {
  return (
    <div>
      <TopSection title="Admin" />

      <div className="m-8">
        <UpgradeToAdminForm />
      </div>
    </div>
  );
}

const UpgradeToAdminForm = () => {
  const {
    register,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<ChangePremiumStatusOptions>({
    resolver: zodResolver(changePremiumStatusSchema),
  });

  const onSubmit: SubmitHandler<ChangePremiumStatusOptions> = useCallback(
    async (data) => {
      const res = await changePremiumStatus(data);
      if (isErrorMessage(res)) toastError({ description: res.data });
      else
        toastSuccess({
          description: data.upgrade ? `Upgraded!` : `Downgraded!`,
        });
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
            label: PremiumTier.PRO_MONTHLY,
            value: PremiumTier.PRO_MONTHLY,
          },
          {
            label: PremiumTier.PRO_ANNUALLY,
            value: PremiumTier.PRO_ANNUALLY,
          },
          {
            label: PremiumTier.BUSINESS_MONTHLY,
            value: PremiumTier.BUSINESS_MONTHLY,
          },
          {
            label: PremiumTier.BUSINESS_ANNUALLY,
            value: PremiumTier.BUSINESS_ANNUALLY,
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
