"use client";

import { useCallback, useMemo } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/Button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { isError } from "@/utils/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingContent } from "@/components/LoadingContent";
import { UserResponse } from "@/app/api/user/me/route";
import { postRequest } from "@/utils/api";
import { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { Select } from "@/components/Select";
import { Frequency } from "@prisma/client";
import {
  SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/app/api/user/settings/email-updates/validation";

export function EmailUpdatesSection() {
  const { data, isLoading, error } = useSWR<UserResponse>("/api/user/me");

  return (
    <FormSection id="email-updates">
      <FormSectionLeft
        title="Email Updates"
        description="Get updates on your inbox stats direct to your email."
      />

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <StatsUpdateSectionForm
            statsEmailFrequency={data.statsEmailFrequency}
          />
        )}
      </LoadingContent>
    </FormSection>
  );
}

function StatsUpdateSectionForm(props: { statsEmailFrequency: Frequency }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SaveEmailUpdateSettingsBody>({
    resolver: zodResolver(saveEmailUpdateSettingsBody),
    defaultValues: {
      statsEmailFrequency: props.statsEmailFrequency,
    },
  });

  const onSubmit: SubmitHandler<SaveEmailUpdateSettingsBody> = useCallback(
    async (data) => {
      const res = await postRequest<
        SaveEmailUpdateSettingsResponse,
        SaveEmailUpdateSettingsBody
      >("/api/user/settings/email-updates", data);

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

  const options: { label: string; value: Frequency }[] = useMemo(
    () => [
      {
        label: "Never",
        value: Frequency.NEVER,
      },
      {
        label: "Weekly",
        value: Frequency.WEEKLY,
      },
    ],
    [],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        name="statsEmailFrequency"
        label="Stats Update Email"
        options={options}
        registerProps={register("statsEmailFrequency")}
        error={errors.statsEmailFrequency}
      />

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
