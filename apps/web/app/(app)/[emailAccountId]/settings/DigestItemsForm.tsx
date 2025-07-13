import { useCallback, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { useRules } from "@/hooks/useRules";
import { Toggle } from "@/components/Toggle";
import { updateDigestItemsAction } from "@/utils/actions/settings";
import {
  updateDigestItemsBody,
  type UpdateDigestItemsBody,
} from "@/utils/actions/settings.validation";
import { ActionType } from "@prisma/client";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { GetDigestSettingsResponse } from "@/app/api/user/digest-settings/route";
import { Skeleton } from "@/components/ui/skeleton";

export function DigestItemsForm() {
  const { emailAccountId } = useAccount();
  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
    mutate: mutateRules,
  } = useRules();
  const {
    data: digestSettings,
    isLoading: digestLoading,
    error: digestError,
    mutate: mutateDigestSettings,
  } = useSWR<GetDigestSettingsResponse>("/api/user/digest-settings");

  const isLoading = rulesLoading || digestLoading;
  const error = rulesError || digestError;

  const {
    handleSubmit,
    formState: { isSubmitting },
    reset,
    watch,
    setValue,
  } = useForm<UpdateDigestItemsBody>({
    resolver: zodResolver(updateDigestItemsBody),
    defaultValues: {
      ruleDigestPreferences: {},
      coldEmailDigest: false,
    },
  });

  const ruleDigestPreferences = watch("ruleDigestPreferences");
  const coldEmailDigest = watch("coldEmailDigest");

  // Initialize preferences from rules and digest settings data
  useEffect(() => {
    if (rules && digestSettings) {
      const preferences: Record<string, boolean> = {};
      rules.forEach((rule) => {
        preferences[rule.id] = rule.actions.some(
          (action) => action.type === ActionType.DIGEST,
        );
      });
      reset({
        ruleDigestPreferences: preferences,
        coldEmailDigest: digestSettings.coldEmail || false,
      });
    }
  }, [rules, digestSettings, reset]);

  const handleRuleDigestToggle = useCallback(
    (ruleId: string, enabled: boolean) => {
      setValue(`ruleDigestPreferences.${ruleId}`, enabled);
    },
    [setValue],
  );

  const handleColdEmailDigestToggle = useCallback(
    (enabled: boolean) => {
      setValue("coldEmailDigest", enabled);
    },
    [setValue],
  );

  const onSubmit: SubmitHandler<UpdateDigestItemsBody> = useCallback(
    async (data) => {
      const result = await updateDigestItemsAction(emailAccountId, data);

      if (result?.serverError) {
        toastError({
          title: "Error updating digest items",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Your digest items have been updated!" });
        mutateRules();
        mutateDigestSettings();
      }
    },
    [mutateRules, mutateDigestSettings, emailAccountId],
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="min-h-[500px] w-full" />}
    >
      <form onSubmit={handleSubmit(onSubmit)}>
        <Label>Choose what to include in the digest:</Label>

        <div className="mt-2 space-y-2">
          {rules?.map((rule) => (
            <DigestItem
              key={rule.id}
              label={rule.name}
              enabled={ruleDigestPreferences[rule.id] ?? false}
              onChange={(enabled) => handleRuleDigestToggle(rule.id, enabled)}
            />
          ))}

          <DigestItem
            label="Cold Emails"
            enabled={coldEmailDigest ?? false}
            onChange={handleColdEmailDigestToggle}
          />
        </div>

        <Button type="submit" loading={isSubmitting} className="mt-4">
          Save
        </Button>
      </form>
    </LoadingContent>
  );
}

function DigestItem({
  label,
  enabled,
  onChange,
}: {
  label: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-4 rounded-lg border p-4">
      <div className="flex flex-1 items-center gap-2">
        <span className="font-medium">{label}</span>
      </div>
      <Toggle name={label} enabled={enabled} onChange={onChange} />
    </div>
  );
}
