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
import type { UserFrequency } from "@prisma/client";
import type { SaveDigestFrequencyBody } from "@/utils/actions/settings.validation";
import { updateDigestFrequencyAction } from "@/utils/actions/settings";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import {
  FrequencyPicker,
  getInitialFrequencyProps,
  mapToUserFrequency,
} from "./FrequencyPicker";

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
  const [digestFrequencyValue, setDigestFrequencyValue] = useState(
    mapToUserFrequency(getInitialFrequencyProps(digestFrequency)),
  );

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

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    execute({
      userFrequency: digestFrequencyValue,
    });
  };

  return (
    <form onSubmit={onSubmit}>
      <div className="md:col-span-2">
        <FrequencyPicker
          defaultValue={getInitialFrequencyProps(digestFrequency)}
          onChange={setDigestFrequencyValue}
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
