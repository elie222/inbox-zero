"use client";

import { useCallback, useMemo } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import type { UserResponse } from "@/app/api/user/me/route";
import type { SaveEmailUpdateSettingsResponse } from "@/app/api/user/settings/email-updates/route";
import { LoadingContent } from "@/components/LoadingContent";
import { toastError, toastSuccess } from "@/components/Toast";
import { postRequest } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { ColdEmailSetting } from "@prisma/client";
import { Select } from "@/components/Select";
import { isError } from "@/utils/error";
import { Button } from "@/components/Button";
import {
  type UpdateColdEmailSettingsBody,
  updateColdEmailSettingsBody,
} from "@/app/api/user/settings/cold-email/validation";
import { TestRules } from "@/app/(app)/cold-email-blocker/TestRules";
import { ColdEmailPromptModal } from "@/app/(app)/cold-email-blocker/ColdEmailPromptModal";

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
        label: 'Archive and label as "Cold Email"',
        value: ColdEmailSetting.ARCHIVE_AND_LABEL,
      },
      {
        label: 'Label as "Cold Email"',
        value: ColdEmailSetting.LABEL,
      },
      {
        label: "Only list here",
        value: ColdEmailSetting.LIST,
      },
      {
        label: "Disabled",
        value: ColdEmailSetting.DISABLED,
      },
    ],
    [],
  );

  const onSubmitForm = handleSubmit(onSubmit);

  return (
    <form onSubmit={onSubmitForm} className="flex max-w-sm items-end space-x-2">
      <Select
        name="coldEmailBlocker"
        label="How should we handle cold emails?"
        options={options}
        registerProps={register("coldEmailBlocker")}
        error={errors.coldEmailBlocker}
      />

      <div className="">
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
      </div>
    </form>
  );
}
