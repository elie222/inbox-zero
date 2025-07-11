import { useCallback, useEffect } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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

export function DigestItemsForm() {
  const { emailAccountId } = useAccount();
  const { data: rules, isLoading, error, mutate } = useRules();

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
    },
  });

  const ruleDigestPreferences = watch("ruleDigestPreferences");

  // Initialize preferences from rules data
  useEffect(() => {
    if (rules) {
      const preferences: Record<string, boolean> = {};
      rules.forEach((rule) => {
        preferences[rule.id] = rule.actions.some(
          (action) => action.type === ActionType.DIGEST,
        );
      });
      reset({
        ruleDigestPreferences: preferences,
      });
    }
  }, [rules, reset]);

  const handleRuleDigestToggle = useCallback(
    (ruleId: string, enabled: boolean) => {
      setValue(`ruleDigestPreferences.${ruleId}`, enabled);
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
        mutate();
      }
    },
    [mutate, emailAccountId],
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <form onSubmit={handleSubmit(onSubmit)}>
        <Label>Choose what to include in the digest:</Label>

        <div className="mt-2 space-y-2">
          {rules?.map((rule) => (
            <div
              key={rule.id}
              className="flex items-center gap-4 rounded-lg border p-4"
            >
              <div className="flex flex-1 items-center gap-2">
                <span className="font-medium">{rule.name}</span>
              </div>
              <Toggle
                name={`rule-${rule.id}`}
                enabled={ruleDigestPreferences[rule.id] ?? false}
                onChange={(enabled) => handleRuleDigestToggle(rule.id, enabled)}
              />
            </div>
          ))}
        </div>

        <Button type="submit" loading={isSubmitting} className="mt-4">
          Save
        </Button>
      </form>
    </LoadingContent>
  );
}
