"use client";

import { useCallback, useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { isError } from "@/utils/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { postRequest } from "@/utils/api";
import type { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { Select } from "@/components/Select";
import { Frequency } from "@prisma/client";
import {
  type SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/app/api/user/settings/email-updates/validation";

export function EmailUpdatesSection({
  statsEmailFrequency,
}: {
  statsEmailFrequency: Frequency;
}) {
  return (
    <FormSection id="email-updates">
      <FormSectionLeft
        title="Email Updates"
        description="Get a weekly digest of items that need your attention."
      />

      <StatsUpdateSectionForm statsEmailFrequency={statsEmailFrequency} />
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
      {/* <Select
        label="Stats Update Email"
        options={options}
        {...register("statsEmailFrequency")}
        error={errors.statsEmailFrequency}
      /> */}
      <Select
        label="Summary Email"
        options={options}
        {...register("summaryEmailFrequency")}
        error={errors.summaryEmailFrequency}
      />

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
