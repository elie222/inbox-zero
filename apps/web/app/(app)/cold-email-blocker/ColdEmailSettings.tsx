"use client";

import { useCallback, useMemo } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import type { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ColdEmailSetting } from "@prisma/client";
import { isError } from "@/utils/error";
import { Button } from "@/components/ui/button";
import {
  type UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";
import { ColdEmailPromptForm } from "@/app/(app)/cold-email-blocker/ColdEmailPromptForm";
import { RadioGroup } from "@/components/RadioGroup";
import { useUser } from "@/hooks/useUser";

export function ColdEmailSettings() {
  const { data, isLoading, error, mutate } = useUser();

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
      const res = await postRequest<
        SaveEmailUpdateSettingsResponse,
        UpdateColdEmailSettingsBody
      >("/api/user/settings/cold-email", {
        coldEmailBlocker: data.coldEmailBlocker,
      });

      if (isError(res)) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({ description: "Settings updated!" });
        onSuccess?.();
      }
    },
    [onSuccess],
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
