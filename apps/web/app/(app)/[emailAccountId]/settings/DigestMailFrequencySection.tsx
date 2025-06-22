"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FormSection,
  FormSectionLeft,
  SubmitButtonWrapper,
} from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import type { Schedule } from "@prisma/client";
import type { SaveDigestScheduleBody } from "@/utils/actions/settings.validation";
import { updateDigestScheduleAction } from "@/utils/actions/settings";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import {
  SchedulePicker,
  getInitialScheduleProps,
  mapToSchedule,
} from "./SchedulePicker";

export function DigestMailFrequencySection({
  digestSchedule,
  mutate,
}: {
  digestSchedule?: Schedule;
  mutate: () => void;
}) {
  return (
    <FormSection id="digest-mail-frequency">
      <FormSectionLeft
        title="Digest Email"
        description="Configure how often you receive digest emails."
      />

      <DigestUpdateSectionForm
        digestSchedule={digestSchedule}
        mutate={mutate}
      />
    </FormSection>
  );
}

function DigestUpdateSectionForm({
  digestSchedule,
  mutate,
}: {
  digestSchedule?: Schedule;
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [digestScheduleValue, setDigestScheduleValue] = useState(
    mapToSchedule(getInitialScheduleProps(digestSchedule)),
  );

  const { execute, isExecuting } = useAction(
    updateDigestScheduleAction.bind(null, emailAccountId),
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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    execute({
      schedule: digestScheduleValue,
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="md:col-span-2">
        <SchedulePicker
          defaultValue={getInitialScheduleProps(digestSchedule)}
          onChange={setDigestScheduleValue}
        />
        <SubmitButtonWrapper>
          <Button type="submit" loading={isExecuting}>
            Save
          </Button>
        </SubmitButtonWrapper>
      </div>
    </form>
  );
}
