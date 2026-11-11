"use client";

import Link from "next/link";
import { Trans, useLingui } from "@lingui/react/macro";
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
      data?.hasAiApiKey && data.aiProvider === Provider.OPEN_AI
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
            hasAiApiKey={data.hasAiApiKey}
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
  hasAiApiKey: boolean;
  models?: OpenAiModelsResponse;
  refetchUser: () => void;
  emailAccountId: string;
}) {
  const { refetchUser, emailAccountId } = props;
  const { t } = useLingui();

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
      aiApiKey: undefined,
    },
  });

  const aiProvider = watch("aiProvider");
  const aiApiKey = watch("aiApiKey");
  const hasStoredAiApiKey =
    props.hasAiApiKey && props.aiProvider === aiProvider;
  const hasAnyApiKey = !!aiApiKey || hasStoredAiApiKey;

  const onSubmit: SubmitHandler<SaveAiSettingsBody> = useCallback(
    async (data) => {
      const res = await updateAiSettingsAction(data);

      if (res?.serverError) {
        toastError({
          description: res.serverError,
        });
      } else {
        toastSuccess({
          description: t`Settings updated! Please check it works on the Assistant page.`,
        });
      }

      refetchUser();
    },
    [refetchUser, t],
  );

  const globalError = (errors as Record<string, { message?: string }>)[""];

  const modelSelectOptions =
    aiProvider === Provider.OPEN_AI && hasAnyApiKey
      ? props.models?.map((model) => ({
          label: model.id,
          value: model.id,
        })) || []
      : [];

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-sm space-y-4">
      <Select
        label={t`Provider`}
        options={providerOptions.map((option) =>
          option.value === DEFAULT_PROVIDER
            ? { ...option, label: t`Default` }
            : option,
        )}
        {...register("aiProvider")}
        error={errors.aiProvider}
      />

      {aiProvider !== DEFAULT_PROVIDER && (
        <>
          {modelSelectOptions.length ? (
            <Select
              label={t`Model`}
              options={modelSelectOptions}
              {...register("aiModel")}
              error={errors.aiModel}
            />
          ) : (
            <Input
              type="text"
              name="aiModel"
              label={t`Model`}
              registerProps={register("aiModel")}
              error={errors.aiModel}
            />
          )}

          <Input
            type="password"
            name="aiApiKey"
            label={t`API Key`}
            registerProps={register("aiApiKey")}
            error={errors.aiApiKey}
            placeholder={
              hasStoredAiApiKey
                ? t`Leave blank to keep the current key`
                : undefined
            }
            explainText={
              hasStoredAiApiKey
                ? t`Leave this blank to keep the current API key, or enter a new key to replace it.`
                : undefined
            }
          />
        </>
      )}

      {globalError?.message && (
        <AlertError title={t`Error saving`} description={globalError.message} />
      )}

      {aiProvider === Provider.OPEN_AI &&
        hasAnyApiKey &&
        modelSelectOptions.length === 0 &&
        (hasStoredAiApiKey ? (
          <AlertError
            title={t`Invalid API Key`}
            description={t`We couldn't validate your API key. Please try again.`}
          />
        ) : (
          <AlertBasic
            title={t`API Key`}
            description={t`Click Save to view available models for your API key.`}
          />
        ))}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" loading={isSubmitting}>
          <Trans>Save</Trans>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={prefixPath(emailAccountId, "/usage")}>
            <BarChartIcon className="mr-2 size-4" />
            <Trans>View usage</Trans>
          </Link>
        </Button>
      </div>
    </form>
  );
}
