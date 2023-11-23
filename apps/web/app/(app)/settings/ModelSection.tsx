"use client";

import { useCallback, useMemo } from "react";
import { SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/Button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { Input } from "@/components/Input";
import { isError } from "@/utils/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingContent } from "@/components/LoadingContent";
import { UserResponse } from "@/app/api/user/me/route";
import { postRequest } from "@/utils/api";
import {
  saveSettingsBody,
  SaveSettingsBody,
} from "@/app/api/user/settings/validation";
import { SaveSettingsResponse } from "@/app/api/user/settings/route";
import { AIModel } from "@/utils/openai";
import { Select } from "@/components/Select";

export function ModelSection() {
  const { data, isLoading, error } = useSWR<UserResponse>("/api/user/me");

  return (
    <FormSection>
      <FormSectionLeft
        title="AI Model"
        description="Use your own API key and choose your AI model."
      />

      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <ModelSectionForm
            aiModel={data.aiModel as AIModel | null}
            openAIApiKey={data.openAIApiKey}
          />
        )}
      </LoadingContent>
    </FormSection>
  );
}

function ModelSectionForm(props: {
  aiModel: AIModel | null;
  openAIApiKey: string | null;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SaveSettingsBody>({
    resolver: zodResolver(saveSettingsBody),
    defaultValues: {
      aiModel: props.aiModel ?? undefined,
      openAIApiKey: props.openAIApiKey ?? undefined,
    },
  });

  const onSubmit: SubmitHandler<SaveSettingsBody> = useCallback(
    async (data) => {
      const res = await postRequest<SaveSettingsResponse, SaveSettingsBody>(
        "/api/user/settings",
        data,
      );

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

  const options: { label: string; value: AIModel }[] = useMemo(
    () => [
      {
        label: "GPT 3.5 Turbo",
        value: "gpt-3.5-turbo-1106",
      },
      {
        label: "GPT-4",
        value: "gpt-4-1106-preview",
      },
    ],
    [],
  );

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        name="aiModel"
        label="Model"
        options={options}
        registerProps={register("aiModel")}
        error={errors.aiModel}
      />

      <Input
        type="password"
        name="openAIApiKey"
        label="OpenAI API Key"
        registerProps={register("openAIApiKey")}
        error={errors.openAIApiKey}
      />
      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
