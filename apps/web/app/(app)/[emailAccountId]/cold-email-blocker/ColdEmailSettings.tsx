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
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Label } from "@/components/ui/label";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { Toggle } from "@/components/Toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const { emailAccountId, provider } = useAccount();

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
        label: isMicrosoftProvider(provider)
          ? "Move to Folder & Mark Read"
          : "Archive, Mark Read & Label",
        description: isMicrosoftProvider(provider)
          ? "Move cold emails to a folder and mark them as read"
          : "Archive cold emails, mark them as read, and label them",
      },
      {
        value: ColdEmailSetting.ARCHIVE_AND_LABEL,
        label: isMicrosoftProvider(provider)
          ? "Move to Folder"
          : "Archive & Label",
        description: isMicrosoftProvider(provider)
          ? "Move cold emails to a folder"
          : "Archive cold emails and label them",
      },
      {
        value: ColdEmailSetting.LABEL,
        label: isMicrosoftProvider(provider) ? "Categorize only" : "Label Only",
        description: isMicrosoftProvider(provider)
          ? "Categorize cold emails, but keep them in my inbox"
          : "Label cold emails, but keep them in my inbox",
      },
      {
        value: ColdEmailSetting.DISABLED,
        label: "Turn Off",
        description: "Disable cold email blocker",
      },
    ],
    [provider],
  );

  return (
    <form onSubmit={onSubmitForm} className="max-w-lg space-y-6">
      <div className="space-y-2">
        <Label htmlFor="cold-email-select">
          How should we handle cold emails?
        </Label>
        <Controller
          name="coldEmailBlocker"
          control={control}
          render={({ field }) => (
            <Select
              value={field.value || undefined}
              onValueChange={field.onChange}
            >
              <SelectTrigger id="cold-email-select">
                <SelectValue placeholder="Select an option">
                  {options.find((opt) => opt.value === field.value)?.label}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex flex-col">
                      <span className="font-medium">{option.label}</span>
                      <span className="text-sm text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.coldEmailBlocker && (
          <p className="text-sm text-destructive">
            {errors.coldEmailBlocker.message}
          </p>
        )}
      </div>

      <Controller
        name="coldEmailDigest"
        control={control}
        render={({ field }) => (
          <Toggle
            name="coldEmailDigest"
            labelRight="Include cold emails in digest"
            enabled={field.value ?? false}
            onChange={field.onChange}
            error={errors.coldEmailDigest}
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
