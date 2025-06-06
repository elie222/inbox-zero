"use client";

import { useCallback, useMemo, useEffect } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  FormSection,
  FormSectionLeft,
  FormSectionRight,
  SubmitButtonWrapper,
} from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { Select } from "@/components/Select";
import { Frequency, type UserFrequency } from "@prisma/client";
import {
  type SaveDigestFrequencyBody,
  saveDigestFrequencyBody,
} from "@/utils/actions/settings.validation";
import { updateDigestFrequencyAction } from "@/utils/actions/settings";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { frequencyToUserFrequency } from "@/utils/frequency";

export function DigestMailFrequencySection({
  digestFrequency,
  mutate,
}: {
  digestFrequency?: UserFrequency;
  mutate: () => void;
}) {
  return (
    <FormSection id="digest-mail-frequency">
      <FormSectionLeft
        title="Digest Mail Frequency"
        description="Configure how often you receive digest emails."
      />

      <DigestUpdateSectionForm
        digestFrequency={digestFrequency}
        mutate={mutate}
      />
    </FormSection>
  );
}

function DigestUpdateSectionForm({
  digestFrequency,
  mutate,
}: {
  digestFrequency?: UserFrequency;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<SaveDigestFrequencyBody>({
    resolver: zodResolver(saveDigestFrequencyBody),
    defaultValues: {
      digestEmailFrequency: Frequency.NEVER,
    },
  });

  const { execute, isExecuting } = useAction(
    updateDigestFrequencyAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: "Your digest settings have been updated!",
        });
      },
      onError: (error) => {
        toastError({
          description:
            error.error.serverError ??
            "An unknown error occurred while updating your settings",
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  useEffect(() => {
    if (digestFrequency) {
      // Convert UserFrequency settings to form values
      const frequency =
        digestFrequency.intervalDays === 1
          ? Frequency.DAILY
          : digestFrequency.intervalDays === 7
            ? Frequency.WEEKLY
            : Frequency.NEVER;

      reset({
        digestEmailFrequency: frequency,
      });
    }
  }, [digestFrequency, reset]);

  const frequency = watch("digestEmailFrequency");

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

  return (
    <form onSubmit={handleSubmit(execute)}>
      <div className="md:col-span-2">
        <FormSectionRight>
          <div className="sm:col-span-full">
            <Select
              label="Digest Email"
              options={frequencyOptions}
              {...register("digestEmailFrequency")}
              error={errors.digestEmailFrequency}
            />
          </div>
        </FormSectionRight>
        <SubmitButtonWrapper>
          <Button type="submit" loading={isExecuting}>
            Save
          </Button>
        </SubmitButtonWrapper>
      </div>
    </form>
  );
}
