"use client";

import { useCallback, useMemo } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { zodResolver } from "@hookform/resolvers/zod";
import { ColdEmailSetting } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  type UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/utils/actions/cold-email.validation";
import { updateColdEmailSettingsAction } from "@/utils/actions/cold-email";
import { ColdEmailPromptForm } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailPromptForm";
import { RadioGroup } from "@/components/RadioGroup";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ColdEmailSettings() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <div className="space-y-10">
          <ColdEmailForm coldEmailBlocker={data.coldEmailBlocker} />
          <ColdEmailPromptForm
            coldEmailPrompt={data.coldEmailPrompt}
            onSuccess={mutate}
          />
        </div>
      )}
    </LoadingContent>
  );
}

export function ColdEmailForm({
  coldEmailBlocker,
  buttonText,
  onSuccess,
}: {
  coldEmailBlocker?: ColdEmailSetting | null;
  buttonText?: string;
  onSuccess?: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailSettingsBody>({
    resolver: zodResolver(updateColdEmailSettingsBody),
    defaultValues: {
      coldEmailBlocker: coldEmailBlocker || ColdEmailSetting.DISABLED,
    },
  });

  const onSubmit: SubmitHandler<UpdateColdEmailSettingsBody> = useCallback(
    async (data) => {
      const result = await updateColdEmailSettingsAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({ description: "Settings updated!" });
        onSuccess?.();
      }
    },
    [onSuccess, emailAccountId],
  );

  const onSubmitForm = handleSubmit(onSubmit);

  const options: {
    value: ColdEmailSetting;
    label: string;
    description: string;
  }[] = useMemo(
    () => [
      {
        value: ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
        label: "Archive, Mark Read & Label",
        description: "Archive cold emails, mark them as read, and label them",
      },
      {
        value: ColdEmailSetting.ARCHIVE_AND_LABEL,
        label: "Archive & Label",
        description: "Archive cold emails and label them",
      },
      {
        value: ColdEmailSetting.LABEL,
        label: "Label Only",
        description: "Label cold emails, but keep them in my inbox",
      },
      {
        value: ColdEmailSetting.DISABLED,
        label: "Turn Off",
        description: "Disable cold email blocker",
      },
    ],
    [],
  );

  return (
    <form onSubmit={onSubmitForm} className="max-w-lg">
      <Controller
        name="coldEmailBlocker"
        control={control}
        render={({ field }) => (
          <RadioGroup
            label="How should we handle cold emails?"
            options={options}
            {...field}
            error={errors.coldEmailBlocker}
          />
        )}
      />

      <div className="mt-2">
        <Button type="submit" loading={isSubmitting}>
          {buttonText || "Save"}
        </Button>
      </div>
    </form>
  );
}
