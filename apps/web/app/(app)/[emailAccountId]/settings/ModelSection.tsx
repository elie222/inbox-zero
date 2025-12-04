"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { FormSection, FormSectionLeft } from "@/components/Form";
import { toastError, toastSuccess } from "@/components/Toast";
import { Input } from "@/components/Input";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingContent } from "@/components/LoadingContent";
import {
  saveAiSettingsBody,
  type SaveAiSettingsBody,
} from "@/utils/actions/settings.validation";
import { Select } from "@/components/Select";
import type { OpenAiModelsResponse } from "@/app/api/ai/models/route";
import { AlertBasic, AlertError } from "@/components/Alert";
import {
  DEFAULT_PROVIDER,
  Provider,
  providerOptions,
} from "@/utils/llms/config";
import { useUser } from "@/hooks/useUser";
import {
  testAiSettingsAction,
  updateAiSettingsAction,
} from "@/utils/actions/settings";

export function ModelSection() {
  const { data, isLoading, error, mutate } = useUser();

  const { data: dataModels, isLoading: isLoadingModels } =
    useSWR<OpenAiModelsResponse>(
      data?.aiApiKey && data?.aiProvider === Provider.OPEN_AI
        ? "/api/ai/models"
        : null,
    );

  return (
    <FormSection>
      <FormSectionLeft
        title="AI Model"
        description="Use the default model at no cost, or choose a custom model with your own API key."
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

function ModelSectionForm(props: {
  aiProvider: SaveAiSettingsBody["aiProvider"] | null;
  aiModel: SaveAiSettingsBody["aiModel"] | null;
  aiApiKey: SaveAiSettingsBody["aiApiKey"] | null;
  models?: OpenAiModelsResponse;
  refetchUser: () => void;
}) {
  const { refetchUser } = props;

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SaveAiSettingsBody>({
    resolver: zodResolver(saveAiSettingsBody),
    defaultValues: {
      aiProvider: props.aiProvider ?? DEFAULT_PROVIDER,
      aiModel: props.aiModel ?? "",
      aiApiKey: props.aiApiKey ?? undefined,
    },
  });

  const [isTesting, setIsTesting] = useState(false);
  const aiProvider = watch("aiProvider");

  const onSubmit: SubmitHandler<SaveAiSettingsBody> = useCallback(
    async (data) => {
      const res = await updateAiSettingsAction(data);

      if (res?.serverError) {
        toastError({
          description: "There was an error updating the settings.",
        });
      } else {
        toastSuccess({
          description:
            "Settings updated! Please check it works on the Assistant page.",
        });
      }

      refetchUser();
    },
    [refetchUser],
  );

  const handleTestConnection = useCallback(
    () =>
      handleSubmit(async (data) => {
        setIsTesting(true);

        try {
          const res = await testAiSettingsAction(data);

          if (res?.serverError) {
            toastError({ description: res.serverError });
          } else if (res?.validationErrors) {
            toastError({
              description: "Please fix the highlighted errors before testing.",
            });
          } else if (res?.data?.success) {
            const descriptor =
              res.data.model ?? res.data.provider ?? "your AI settings";
            toastSuccess({
              description: `Connection successful for ${descriptor}.`,
            });
          } else {
            toastError({
              description: "Unable to test the AI connection.",
            });
          }
        } catch (error) {
          toastError({
            description:
              error instanceof Error
                ? error.message
                : "Unable to test the AI connection.",
          });
        } finally {
          setIsTesting(false);
        }
      })(),
    [handleSubmit],
  );

  const globalError = (errors as any)[""];

  const modelSelectOptions =
    aiProvider === Provider.OPEN_AI && watch("aiApiKey")
      ? props.models?.map((m) => ({
          label: m.id,
          value: m.id,
        })) || []
      : [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Select
        label="Provider"
        options={providerOptions}
        {...register("aiProvider")}
        error={errors.aiProvider}
      />

      {watch("aiProvider") !== DEFAULT_PROVIDER && (
        <>
          {modelSelectOptions.length ? (
            <Select
              label="Model"
              options={modelSelectOptions}
              {...register("aiModel")}
              error={errors.aiModel}
            />
          ) : (
            <Input
              type="text"
              name="aiModel"
              label="Model"
              registerProps={register("aiModel")}
              error={errors.aiModel}
            />
          )}

          <Input
            type="password"
            name="aiApiKey"
            label="API Key"
            registerProps={register("aiApiKey")}
            error={errors.aiApiKey}
          />
        </>
      )}

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

      <div className="flex gap-2">
        <Button type="submit" loading={isSubmitting}>
          Save
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestConnection}
          loading={isTesting}
          disabled={isSubmitting}
        >
          Test connection
        </Button>
      </div>
    </form>
  );
}
