"use client";

import { useCallback, useMemo, useEffect } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function ColdEmailSettings() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <div className="space-y-10">
          <ColdEmailForm
            coldEmailBlocker={data.coldEmailBlocker}
            coldEmailDigest={data.coldEmailDigest}
          />
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
  coldEmailDigest,
  buttonText,
  onSuccess,
}: {
  coldEmailBlocker?: ColdEmailSetting | null;
  coldEmailDigest?: boolean;
  buttonText?: string;
  onSuccess?: () => void;
}) {
  const { emailAccountId } = useAccount();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailSettingsBody>({
    resolver: zodResolver(updateColdEmailSettingsBody),
    defaultValues: {
      coldEmailBlocker: coldEmailBlocker || ColdEmailSetting.DISABLED,
      coldEmailDigest: coldEmailDigest ?? false,
    },
  });

  // Reset form when props change (when data loads)
  useEffect(() => {
    reset({
      coldEmailBlocker: coldEmailBlocker || ColdEmailSetting.DISABLED,
      coldEmailDigest: coldEmailDigest ?? false,
    });
  }, [coldEmailBlocker, coldEmailDigest, reset]);

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
    <form onSubmit={onSubmitForm} className="max-w-lg space-y-6">
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

      <div className="rounded-lg border border-border bg-card p-4">
        <Controller
          name="coldEmailDigest"
          control={control}
          render={({ field }) => (
            <div className="flex items-center space-x-3">
              <Checkbox
                id="coldEmailDigest"
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
              />
              <div className="space-y-1">
                <Label
                  htmlFor="coldEmailDigest"
                  className="text-sm font-medium"
                >
                  Include cold emails in digest
                </Label>
                <p className="text-sm text-muted-foreground">
                  Cold emails will be included in your digest instead of being
                  processed immediately
                </p>
              </div>
            </div>
          )}
        />
      </div>

      <div className="mt-2">
        <Button type="submit" loading={isSubmitting}>
          {buttonText || "Save"}
        </Button>
      </div>
    </form>
  );
}
