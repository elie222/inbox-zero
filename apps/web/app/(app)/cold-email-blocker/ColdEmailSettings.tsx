"use client";

import { useCallback, useMemo } from "react";
import { Controller, type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import type { UserResponse } from "@/app/api/user/me/route";
import type { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ColdEmailSetting } from "@prisma/client";
import { isError } from "@/utils/error";
import { Button } from "@/components/Button";
import {
  type UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";
import { TestRules } from "@/app/(app)/cold-email-blocker/TestRules";
import { ColdEmailPromptModal } from "@/app/(app)/cold-email-blocker/ColdEmailPromptModal";
import { RadioGroup } from "@/components/RadioGroup";

export function ColdEmailSettings() {
  const { data, isLoading, error, mutate } =
    useSWR<UserResponse>("/api/user/me");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <>
          <ColdEmailForm coldEmailBlocker={data.coldEmailBlocker} />
          <div className="mt-2 space-x-2">
            <TestRules />
            <ColdEmailPromptModal
              coldEmailPrompt={data.coldEmailPrompt}
              refetch={mutate}
            />
          </div>
        </>
      )}
    </LoadingContent>
  );
}

export function ColdEmailForm(props: {
  coldEmailBlocker?: ColdEmailSetting | null;
}) {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailSettingsBody>({
    resolver: zodResolver(updateColdEmailSettingsBody),
    defaultValues: {
      coldEmailBlocker: props.coldEmailBlocker || ColdEmailSetting.DISABLED,
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
      }
    },
    [],
  );

  const onSubmitForm = handleSubmit(onSubmit);

  const options: {
    value: ColdEmailSetting;
    label: string;
    description: string;
  }[] = useMemo(
    () => [
      {
        value: ColdEmailSetting.ARCHIVE_AND_LABEL,
        label: "Archive & Label",
        description: "Archive and label cold emails",
      },
      {
        value: ColdEmailSetting.LABEL,
        label: "Label Only",
        description: "Label cold emails as 'Cold Email', but keep in inbox",
      },
      {
        value: ColdEmailSetting.LIST,
        label: "List in App",
        description: "List cold emails in app. Make no changes to inbox.",
      },
      {
        value: ColdEmailSetting.DISABLED,
        label: "Turn Off",
        description: "Disable cold email detection",
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
          Save
        </Button>
      </div>
    </form>
  );
}
