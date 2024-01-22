"use client";

import { useCallback, useMemo } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { UserResponse } from "@/app/api/user/me/route";
import { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ColdEmailSetting } from "@prisma/client";
import { Select } from "@/components/Select";
import { isError } from "@/utils/error";
import { Button } from "@/components/Button";
import {
  UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";
import { TestRules } from "@/app/(app)/cold-email-blocker/TestRules";
import { ColdEmailPromptModal } from "@/app/(app)/cold-email-blocker/ColdEmailPromptModal";

export function ColdEmailSettings() {
  const { data, isLoading, error } = useSWR<UserResponse>("/api/user/me");

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <>
          <ColdEmailForm coldEmailBlocker={data.coldEmailBlocker} />
          <div className="mt-2 space-x-2">
            <TestRules />
            <ColdEmailPromptModal coldEmailPrompt={data.coldEmailPrompt} />
          </div>
        </>
      )}
    </LoadingContent>
  );
}

function ColdEmailForm(props: { coldEmailBlocker?: ColdEmailSetting | null }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UpdateColdEmailSettingsBody>({
    resolver: zodResolver(updateColdEmailSettingsBody),
    defaultValues: { coldEmailBlocker: props.coldEmailBlocker },
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

  const options: { label: string; value: ColdEmailSetting }[] = useMemo(
    () => [
      {
        label: "Off",
        value: ColdEmailSetting.DISABLED,
      },
      {
        label: "List here",
        value: ColdEmailSetting.LIST,
      },
      {
        label: "Auto label",
        value: ColdEmailSetting.LABEL,
      },
      {
        label: "Auto archive and label",
        value: ColdEmailSetting.ARCHIVE_AND_LABEL,
      },
    ],
    [],
  );

  const onSubmitForm = handleSubmit(onSubmit);

  return (
    <form onSubmit={onSubmitForm} className="max-w-sm space-y-2">
      <Select
        name="coldEmailBlocker"
        label="How should we handle cold emails?"
        options={options}
        registerProps={register("coldEmailBlocker")}
        error={errors.coldEmailBlocker}
      />

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
