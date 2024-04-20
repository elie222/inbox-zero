"use client";

import { useCallback } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { toastSuccess, toastError } from "@/components/Toast";
import { TopSection } from "@/components/TopSection";
import { activateLicenseKey } from "@/utils/actions";
import { UserResponse } from "@/app/api/user/me/route";
import { AlertBasic } from "@/components/Alert";

type Inputs = { licenseKey: string };

export default function LicensePage({
  searchParams,
}: {
  searchParams: { "license-key"?: string };
}) {
  const licenseKey = searchParams["license-key"];

  const { data } = useSWR<UserResponse>("/api/user/me");

  return (
    <div>
      <TopSection title="Activate your license" />

      <div className="max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        {data?.premium?.lemonLicenseKey && (
          <AlertBasic
            variant="success"
            title="Your license is activated"
            description="You have an active license key. To add users to your account visit the settings page."
            className="mb-4"
          />
        )}

        <ActivateLicenseForm licenseKey={licenseKey} />
      </div>
    </div>
  );
}

function ActivateLicenseForm(props: { licenseKey?: string }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Inputs>({ defaultValues: { licenseKey: props.licenseKey } });

  const onSubmit: SubmitHandler<Inputs> = useCallback(async (data) => {
    try {
      await activateLicenseKey(data.licenseKey);
      toastSuccess({ description: `License activated!` });
    } catch (error: any) {
      toastError({ description: error.message });
    }
  }, []);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        type="text"
        name="licenseKey"
        label="License Key"
        registerProps={register("licenseKey", { required: true })}
        error={errors.licenseKey}
      />
      <Button type="submit" loading={isSubmitting}>
        Activate
      </Button>
    </form>
  );
}
