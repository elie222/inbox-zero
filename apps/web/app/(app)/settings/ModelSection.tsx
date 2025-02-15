"use client";

import { useCallback, useEffect } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { Input } from "@/components/Input";
import { isError } from "@/utils/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingContent } from "@/components/LoadingContent";
import { postRequest } from "@/utils/api";
import {
  saveSettingsBody,
  type SaveSettingsBody,
} from "@/app/api/user/settings/validation";
import type { SaveSettingsResponse } from "@/app/api/user/settings/route";
import { Select } from "@/components/Select";
import type { OpenAiModelsResponse } from "@/app/api/ai/models/route";
import { AlertBasic, AlertError } from "@/components/Alert";
import { modelOptions, Provider, providerOptions } from "@/utils/llms/config";
import { useUser } from "@/hooks/useUser";

export function ModelSection() {
  const { data, isLoading, error, mutate } = useUser();
  const { data: dataModels, isLoading: isLoadingModels } =
    useSWR<OpenAiModelsResponse>(
      data?.aiApiKey && data.aiProvider === Provider.OPEN_AI
        ? "/api/ai/models"
        : null,
    );

  return (
    <FormSection>
      <FormSectionLeft
        title="AI Model"
        description="Choose your AI model and use your own API key."
      />

      <LoadingContent loading={isLoading || isLoadingModels} error={error}>
        {data && (
          <ModelSectionForm
            aiProvider={data.aiProvider}
            aiModel={data.aiModel}
            aiApiKey={data.aiApiKey}
            models={dataModels}
            refetchUser={mutate}
          />
        )}
      </LoadingContent>
    </FormSection>
  );
}

function getDefaultModel(aiProvider: string | null) {
  const provider = aiProvider || Provider.ANTHROPIC;
  const models = modelOptions[provider];
  return models?.[0]?.value;
}

function ModelSectionForm(props: {
  aiProvider: string | null;
  aiModel: string | null;
  aiApiKey: string | null;
  models?: OpenAiModelsResponse;
  refetchUser: () => void;
}) {
  const { refetchUser } = props;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<SaveSettingsBody>({
    resolver: zodResolver(saveSettingsBody),
    defaultValues: {
      aiProvider: props.aiProvider ?? Provider.ANTHROPIC,
      aiModel: props.aiModel ?? getDefaultModel(props.aiProvider),
      aiApiKey: props.aiApiKey ?? undefined,
    },
  });

  const aiProvider = watch("aiProvider");

  useEffect(() => {
    const aiModel = watch("aiModel");

    // if model not part of provider then switch to default model for provider
    if (!modelOptions[aiProvider].find((o) => o.value === aiModel)) {
      setValue("aiModel", getDefaultModel(aiProvider));
    }
  }, [aiProvider, setValue, watch]);

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

      refetchUser();
    },
    [refetchUser],
  );

  const globalError = (errors as any)[""];

  const modelSelectOptions =
    aiProvider === Provider.OPEN_AI && watch("aiApiKey")
      ? props.models?.map((m) => ({
          label: m.id,
          value: m.id,
        })) || []
      : modelOptions[aiProvider ?? Provider.ANTHROPIC];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Provider"
        options={providerOptions}
        {...register("aiProvider")}
        error={errors.aiProvider}
      />

      <Select
        label="Model"
        options={modelSelectOptions}
        {...register("aiModel")}
        error={errors.aiModel}
      />

      <Input
        type="password"
        name="aiApiKey"
        label="API Key"
        registerProps={register("aiApiKey")}
        error={errors.aiApiKey}
      />

      {globalError && (
        <AlertError title="Error saving" description={globalError.message} />
      )}

      {watch("aiProvider") === Provider.OPEN_AI &&
        watch("aiApiKey") &&
        modelSelectOptions.length === 0 &&
        (props.aiApiKey ? (
          <AlertError
            title="Invalid API Key"
            description="We couldn't validate your API key. Please try again."
          />
        ) : (
          <AlertBasic
            title="API Key"
            description="Click Save to view available models for your API key."
          />
        ))}

      <Button type="submit" loading={isSubmitting}>
        Save
      </Button>
    </form>
  );
}
