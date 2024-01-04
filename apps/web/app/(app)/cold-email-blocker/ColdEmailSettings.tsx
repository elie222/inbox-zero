"use client";

import { useCallback, useMemo } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { UserResponse } from "@/app/api/user/me/route";
import { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ColdEmailSetting } from "@prisma/client";
import { Select } from "@/components/Select";
import { isError } from "@/utils/error";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import {
  UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";

export function ColdEmailSettings() {
  const { data, isLoading, error } = useSWR<UserResponse>("/api/user/me");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <ColdEmailForm
          coldEmailBlocker={data.coldEmailBlocker}
          coldEmailPrompt={data.coldEmailPrompt}
        />
      )}
    </LoadingContent>
  );
}

function ColdEmailForm(props: {
  coldEmailBlocker?: ColdEmailSetting | null;
  coldEmailPrompt?: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailSettingsBody>({
    resolver: zodResolver(updateColdEmailSettingsBody),
    defaultValues: {
      coldEmailBlocker: props.coldEmailBlocker,
      coldEmailPrompt: props.coldEmailPrompt,
    },
  });

  const onSubmit: SubmitHandler<UpdateColdEmailSettingsBody> = useCallback(
    async (data) => {
      const res = await postRequest<
        SaveEmailUpdateSettingsResponse,
        UpdateColdEmailSettingsBody
      >("/api/user/settings/cold-email", data);

      if (isError(res)) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({ description: "Settings updated!" });
      }
    },
    [],
  );

  const options: { label: string; value: ColdEmailSetting }[] = useMemo(
    () => [
      {
        label: "Off",
        value: ColdEmailSetting.DISABLED,
      },
      {
        label: "Only show here",
        value: ColdEmailSetting.LIST,
      },
      {
        label: "Auto label",
        value: ColdEmailSetting.LABEL,
      },
      {
        label: "Auto archive and label",
        value: ColdEmailSetting.ARCHIVE_AND_LABEL,
      },
    ],
    [],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <Select
        name="coldEmailBlocker"
        label="How should we handle cold emails?"
        options={options}
        registerProps={register("coldEmailBlocker")}
        error={errors.coldEmailBlocker}
      />

      <Input
        type="text"
        as="textarea"
        rows={2}
        name="coldEmailPrompt"
        label="Anything to tell the AI about your cold email preferences?"
        registerProps={register("coldEmailPrompt")}
        error={errors.coldEmailPrompt}
      />

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
