"use client";

import Link from "next/link";
import { BarChartIcon } from "lucide-react";
import { useCallback } from "react";
import { type SubmitHandler, useForm } from "react-hook-form";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { Input } from "@/components/Input";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingsSection } from "@/components/SettingsSection";
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
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { updateAiSettingsAction } from "@/utils/actions/settings";

export function ModelSection() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useUser();

  const { data: dataModels, isLoading: isLoadingModels } =
    useSWR<OpenAiModelsResponse>(
      data?.aiApiKey && data.aiProvider === Provider.OPEN_AI
        ? "/api/ai/models"
        : null,
    );

  return (
    <SettingsSection>
      <LoadingContent loading={isLoading || isLoadingModels} error={error}>
        {data && (
          <ModelSectionForm
            aiProvider={data.aiProvider}
            aiModel={data.aiModel}
            aiApiKey={data.aiApiKey}
            models={dataModels}
            refetchUser={mutate}
            emailAccountId={emailAccountId}
          />
        )}
      </LoadingContent>
    </SettingsSection>
  );
}

function ModelSectionForm(props: {
  aiProvider: SaveAiSettingsBody["aiProvider"] | null;
  aiModel: SaveAiSettingsBody["aiModel"] | null;
  aiApiKey: SaveAiSettingsBody["aiApiKey"] | null;
  models?: OpenAiModelsResponse;
  refetchUser: () => void;
  emailAccountId: string;
}) {
  const { refetchUser, emailAccountId } = props;

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

  const globalError = (errors as Record<string, { message?: string }>)[""];

  const modelSelectOptions =
    aiProvider === Provider.OPEN_AI && watch("aiApiKey")
      ? props.models?.map((model) => ({
          label: model.id,
          value: model.id,
        })) || []
      : [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
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

      {globalError?.message && (
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

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={isSubmitting}>
          Save
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={prefixPath(emailAccountId, "/usage")}>
            <BarChartIcon className="mr-2 size-4" />
            View usage
          </Link>
        </Button>
      </div>
    </form>
  );
}
