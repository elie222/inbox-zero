"use client";

import { useCallback, useState } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { RefreshCwIcon } from "lucide-react";
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
import type { OllamaModel } from "@/app/api/ai/ollama-models/route";
import { AlertBasic, AlertError } from "@/components/Alert";
import {
  DEFAULT_PROVIDER,
  Provider,
  getProviderOptions,
} from "@/utils/llms/config";
import { useUser } from "@/hooks/useUser";
import {
  testAiSettingsAction,
  updateAiSettingsAction,
} from "@/utils/actions/settings";

export function ModelSection() {
  const { data, isLoading, error, mutate } = useUser();

  // Get server-side config from API response
  const supportsOllama = data?.supportsOllama ?? false;
  const allowUserAiProviderUrl = data?.allowUserAiProviderUrl ?? false;
  const providerOptions = getProviderOptions(supportsOllama);

  const { data: dataModels, isLoading: isLoadingModels } =
    useSWR<OpenAiModelsResponse>(
      data?.aiApiKey && data?.aiProvider === Provider.OPEN_AI
        ? "/api/ai/models"
        : null,
    );

  // Build Ollama models URL with optional custom baseUrl parameter
  // Only fetch when user has Ollama selected and it's supported
  const ollamaModelsUrl =
    supportsOllama && data?.aiProvider === Provider.OLLAMA
      ? data?.aiBaseUrl
        ? `/api/ai/ollama-models?baseUrl=${encodeURIComponent(data.aiBaseUrl)}`
        : "/api/ai/ollama-models"
      : null;

  const {
    data: ollamaModels,
    isLoading: isLoadingOllamaModels,
    mutate: mutateOllamaModels,
  } = useSWR<OllamaModel[]>(ollamaModelsUrl);

  // Refetch models - after saving, the user data will update and trigger a refetch
  const refetchOllamaModels = useCallback(() => {
    mutateOllamaModels();
  }, [mutateOllamaModels]);

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
            aiBaseUrl={data.aiBaseUrl}
            models={dataModels}
            ollamaModels={ollamaModels}
            isLoadingOllamaModels={isLoadingOllamaModels}
            refetchUser={mutate}
            refetchOllamaModels={refetchOllamaModels}
            providerOptions={providerOptions}
            allowUserAiProviderUrl={allowUserAiProviderUrl}
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
  aiBaseUrl: string | null;
  models?: OpenAiModelsResponse;
  refetchUser: () => void;
  refetchOllamaModels: () => void;
  ollamaModels?: OllamaModel[];
  isLoadingOllamaModels?: boolean;
  providerOptions: { label: string; value: string }[];
  allowUserAiProviderUrl: boolean;
}) {
  const {
    refetchUser,
    refetchOllamaModels,
    providerOptions,
    allowUserAiProviderUrl,
  } = props;

  // If user's saved provider is no longer available (e.g., Ollama disabled), reset to default
  const getInitialProvider = () => {
    const savedProvider = props.aiProvider;
    if (!savedProvider) return DEFAULT_PROVIDER;

    // Check if the saved provider is still in the available options
    const isProviderAvailable = providerOptions.some(
      (opt) => opt.value === savedProvider,
    );
    return isProviderAvailable ? savedProvider : DEFAULT_PROVIDER;
  };

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SaveAiSettingsBody>({
    resolver: zodResolver(saveAiSettingsBody),
    defaultValues: {
      aiProvider: getInitialProvider(),
      aiModel: props.aiModel ?? "",
      aiApiKey: props.aiApiKey ?? undefined,
      aiBaseUrl: props.aiBaseUrl ?? "",
    },
  });

  const [isTesting, setIsTesting] = useState(false);
  const aiProvider = watch("aiProvider");
  const aiBaseUrl = watch("aiBaseUrl");

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

  const openAiModelOptions =
    aiProvider === Provider.OPEN_AI && watch("aiApiKey")
      ? props.models?.map((m) => ({
          label: m.id,
          value: m.id,
        })) || []
      : [];

  const ollamaModelOptions =
    aiProvider === Provider.OLLAMA
      ? props.ollamaModels?.map((m) => ({
          label: `${m.name} (${m.details?.parameter_size || "unknown size"})`,
          value: m.name,
        })) || []
      : [];

  const modelSelectOptions =
    aiProvider === Provider.OLLAMA ? ollamaModelOptions : openAiModelOptions;

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
              placeholder={
                aiProvider === Provider.OLLAMA
                  ? "e.g., llama3, mistral"
                  : undefined
              }
            />
          )}

          {aiProvider === Provider.OLLAMA && allowUserAiProviderUrl && (
            <div className="space-y-2">
              <Input
                type="text"
                name="aiBaseUrl"
                label="Server URL (optional)"
                registerProps={register("aiBaseUrl")}
                error={errors.aiBaseUrl}
                placeholder="http://localhost:11434"
                explainText="Custom Ollama or LM Studio server URL. Save first, then refresh models."
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetchOllamaModels()}
                disabled={props.isLoadingOllamaModels}
              >
                <RefreshCwIcon className="mr-2 size-4" />
                {props.isLoadingOllamaModels ? "Loading..." : "Refresh models"}
              </Button>
            </div>
          )}

          {aiProvider === Provider.OPEN_AI && allowUserAiProviderUrl && (
            <Input
              type="text"
              name="aiBaseUrl"
              label="Server URL (optional)"
              registerProps={register("aiBaseUrl")}
              error={errors.aiBaseUrl}
              placeholder="http://localhost:1234/v1"
              explainText="Custom OpenAI-compatible server URL (e.g., LM Studio, LocalAI, vLLM). Leave empty to use OpenAI."
            />
          )}

          {aiProvider !== Provider.OLLAMA && (
            <Input
              type="password"
              name="aiApiKey"
              label="API Key"
              registerProps={register("aiApiKey")}
              error={errors.aiApiKey}
            />
          )}
        </>
      )}

      {globalError && (
        <AlertError title="Error saving" description={globalError.message} />
      )}

      {watch("aiProvider") === Provider.OPEN_AI &&
        watch("aiApiKey") &&
        openAiModelOptions.length === 0 &&
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

      {watch("aiProvider") === Provider.OLLAMA &&
        ollamaModelOptions.length === 0 && (
          <AlertBasic
            title="No Ollama models found"
            description="Make sure Ollama is running and has models installed. You can also type the model name manually above."
          />
        )}

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
