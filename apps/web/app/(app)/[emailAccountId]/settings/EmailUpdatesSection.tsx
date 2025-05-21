"use client";

import { useCallback, useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/Select";
import { Frequency } from "@prisma/client";
import {
  type SaveEmailUpdateSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/utils/actions/settings.validation";
import { updateEmailSettingsAction } from "@/utils/actions/settings";
import { useAccount } from "@/providers/EmailAccountProvider";

export function EmailUpdatesSection({
  summaryEmailFrequency,
  digestEmailFrequency,
  digestEmailDayOfWeek,
  mutate,
}: {
  summaryEmailFrequency: Frequency;
  digestEmailFrequency: Frequency;
  digestEmailDayOfWeek?: number;
  mutate: () => void;
}) {
  return (
    <FormSection id="email-updates">
      <FormSectionLeft
        title="Email Updates"
        description="Get regular updates about your emails."
      />

      <SummaryUpdateSectionForm
        summaryEmailFrequency={summaryEmailFrequency}
        digestEmailFrequency={digestEmailFrequency}
        digestEmailDayOfWeek={digestEmailDayOfWeek}
        mutate={mutate}
      />

      <DigestUpdateSectionForm
        summaryEmailFrequency={summaryEmailFrequency}
        digestEmailFrequency={digestEmailFrequency}
        digestEmailDayOfWeek={digestEmailDayOfWeek}
        mutate={mutate}
      />
    </FormSection>
  );
}

function SummaryUpdateSectionForm({
  summaryEmailFrequency,
  digestEmailFrequency,
  digestEmailDayOfWeek,
  mutate,
}: {
  summaryEmailFrequency: Frequency;
  digestEmailFrequency: Frequency;
  digestEmailDayOfWeek?: number;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SaveEmailUpdateSettingsBody>({
    resolver: zodResolver(saveEmailUpdateSettingsBody),
    defaultValues: {
      summaryEmailFrequency:
        summaryEmailFrequency === Frequency.DAILY
          ? Frequency.NEVER
          : summaryEmailFrequency,
      statsEmailFrequency: Frequency.NEVER,
      digestEmailFrequency,
      digestEmailDayOfWeek,
    },
  });

  const onSubmit: SubmitHandler<SaveEmailUpdateSettingsBody> = useCallback(
    async (data) => {
      const res = await updateEmailSettingsAction(emailAccountId, data);

      if (res?.serverError) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({ description: "Settings updated!" });
      }

      mutate();
    },
    [emailAccountId, mutate],
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

function DigestUpdateSectionForm({
  summaryEmailFrequency,
  digestEmailFrequency,
  digestEmailDayOfWeek,
  mutate,
}: {
  summaryEmailFrequency: Frequency;
  digestEmailFrequency: Frequency;
  digestEmailDayOfWeek?: number;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SaveEmailUpdateSettingsBody>({
    resolver: zodResolver(saveEmailUpdateSettingsBody),
    defaultValues: {
      summaryEmailFrequency:
        summaryEmailFrequency === Frequency.DAILY
          ? Frequency.NEVER
          : summaryEmailFrequency,
      statsEmailFrequency: Frequency.NEVER,
      digestEmailFrequency: digestEmailFrequency,
      digestEmailDayOfWeek,
    },
  });

  const frequency = watch("digestEmailFrequency");

  const onSubmit: SubmitHandler<SaveEmailUpdateSettingsBody> = useCallback(
    async (data) => {
      const res = await updateEmailSettingsAction(emailAccountId, data);

      if (res?.serverError) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({ description: "Settings updated!" });
      }

      mutate();
    },
    [emailAccountId, mutate],
  );

  const frequencyOptions: { label: string; value: Frequency }[] = useMemo(
    () => [
      {
        label: "Never",
        value: Frequency.NEVER,
      },
      {
        label: "Daily",
        value: Frequency.DAILY,
      },
      {
        label: "Weekly",
        value: Frequency.WEEKLY,
      },
    ],
    [],
  );

  const dayOptions: { label: string; value: number }[] = useMemo(
    () => [
      { label: "Monday", value: 1 },
      { label: "Tuesday", value: 2 },
      { label: "Wednesday", value: 3 },
      { label: "Thursday", value: 4 },
      { label: "Friday", value: 5 },
      { label: "Saturday", value: 6 },
      { label: "Sunday", value: 0 },
    ],
    [],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Digest Email"
        options={frequencyOptions}
        {...register("digestEmailFrequency")}
        error={errors.digestEmailFrequency}
      />

      {frequency !== Frequency.NEVER && frequency === Frequency.WEEKLY && (
        <Select
          label="Day of Week"
          options={dayOptions}
          {...register("digestEmailDayOfWeek")}
          error={errors.digestEmailDayOfWeek}
        />
      )}

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
