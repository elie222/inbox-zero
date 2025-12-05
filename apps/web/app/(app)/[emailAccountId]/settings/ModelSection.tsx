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
} from "@/utils/llms/config.shared";
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

  const {
    data: dataModels,
    isLoading: isLoadingModels,
    error: modelsError,
  } = useSWR<OpenAiModelsResponse>(
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
            aiBaseUrl={data.aiBaseUrl}
            models={dataModels}
            modelsError={modelsError}
            modelsLoading={isLoadingModels}
            refetchUser={mutate}
            providerOptions={providerOptions}
            allowUserAiProviderUrl={allowUserAiProviderUrl}
            supportsOllama={supportsOllama}
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
  modelsError?: any;
  modelsLoading?: boolean;
  refetchUser: () => void;
  providerOptions: { label: string; value: string }[];
  allowUserAiProviderUrl: boolean;
  supportsOllama: boolean;
}) {
  const {
    refetchUser,
    providerOptions,
    allowUserAiProviderUrl,
    supportsOllama,
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
  const [testingMessage, setTestingMessage] = useState<string | null>(null);
  const aiProvider = watch("aiProvider");
  const aiBaseUrl = watch("aiBaseUrl");

  // Fetch Ollama models when Ollama is selected (using watched value, not saved value)
  const ollamaModelsUrl =
    supportsOllama && aiProvider === Provider.OLLAMA
      ? aiBaseUrl
        ? `/api/ai/ollama-models?baseUrl=${encodeURIComponent(aiBaseUrl)}`
        : "/api/ai/ollama-models"
      : null;

  const {
    data: ollamaModels,
    isLoading: isLoadingOllamaModels,
    mutate: refetchOllamaModels,
  } = useSWR<OllamaModel[]>(ollamaModelsUrl);

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

  const runTestOnce = useCallback(async (data: SaveAiSettingsBody) => {
    const res = await testAiSettingsAction(data);

    if (res?.serverError) {
      throw new Error(res.serverError);
    }

    if (res?.validationErrors) {
      toastError({
        description: "Please fix the highlighted errors before testing.",
      });
      return "validation" as const;
    }

    if (res?.data?.success) {
      const descriptor =
        res.data.model ?? res.data.provider ?? "your AI settings";
      toastSuccess({
        description: `Connection successful for ${descriptor}.`,
      });
      return "success" as const;
    }

    throw new Error("Unable to test the AI connection.");
  }, []);

  const handleTestConnection = useCallback(
    () =>
      handleSubmit(async (data) => {
        setIsTesting(true);
        setTestingMessage("Testing connection...");

        try {
          let lastError: unknown;

          for (let attempt = 0; attempt < 2; attempt++) {
            if (attempt === 1) {
              setTestingMessage("Retrying in 5 seconds...");
              await new Promise((resolve) => setTimeout(resolve, 5000));
            }

            try {
              const result = await runTestOnce(data);
              if (result !== "validation") {
                return;
              }
              return;
            } catch (error) {
              lastError = error;
              if (attempt === 0) continue;
              throw error;
            }
          }

          if (lastError) {
            throw lastError;
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
          setTestingMessage(null);
        }
      })(),
    [handleSubmit, runTestOnce],
  );

  const globalError = (errors as any)[""];

  const openAiModelOptions =
    aiProvider === Provider.OPEN_AI && watch("aiApiKey")
      ? props.models?.map((m) => ({
          label: m.id,
          value: m.id,
        })) || []
      : [];

  const showInvalidOpenAiKey =
    aiProvider === Provider.OPEN_AI &&
    watch("aiApiKey") &&
    openAiModelOptions.length === 0 &&
    !props.modelsLoading &&
    !!props.modelsError;

  const ollamaModelOptions =
    aiProvider === Provider.OLLAMA
      ? ollamaModels?.map((m) => ({
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
                disabled={isLoadingOllamaModels}
              >
                <RefreshCwIcon className="mr-2 size-4" />
                {isLoadingOllamaModels ? "Loading..." : "Refresh models"}
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
        (showInvalidOpenAiKey ? (
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

      <div className="flex flex-wrap items-center gap-2">
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
        {testingMessage && (
          <span className="text-sm text-muted-foreground">
            {testingMessage}
          </span>
        )}
      </div>
    </form>
  );
}
