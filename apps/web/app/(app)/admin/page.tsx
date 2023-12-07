"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import { TopSection } from "@/components/TopSection";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { isErrorMessage } from "@/utils/error";
import { changePremiumStatus } from "@/utils/actions";

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

type Inputs = { email: string; upgrade: boolean };

const UpgradeToAdminForm = () => {
  const {
    register,
    formState: { errors, isSubmitting },
    getValues,
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = useCallback(async (data) => {
    const res = await changePremiumStatus(data.email, data.upgrade);
    if (isErrorMessage(res)) toastError({ description: res.data });
    else
      toastSuccess({ description: data.upgrade ? `Upgraded!` : `Downgraded!` });
  }, []);

  return (
    <form className="flex items-end gap-2 space-y-4">
      <Input
        type="text"
        name="email"
        label="Email"
        registerProps={register("email", { required: true })}
        error={errors.email}
      />
      <Button
        type="button"
        loading={isSubmitting}
        onClick={() => {
          onSubmit({
            email: getValues("email"),
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
    </form>
  );
};
