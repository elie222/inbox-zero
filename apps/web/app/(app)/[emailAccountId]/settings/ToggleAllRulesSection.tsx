"use client";

import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/components/SettingsSection";
import { toggleAllRulesAction } from "@/utils/actions/rule";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { useRules } from "@/hooks/useRules";

export function ToggleAllRulesSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { data: rules, mutate } = useRules(emailAccountId);

  const allRulesEnabled = rules?.every((rule) => rule.enabled) ?? false;
  const hasRules = (rules?.length ?? 0) > 0;

  const { execute, isExecuting } = useAction(
    toggleAllRulesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Rules updated successfully" });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  if (!hasRules) return null;

  return (
    <SettingsSection
      title="Enable Rules"
      description="Toggle all AI rules on or off for this account."
      titleClassName="text-sm"
      descriptionClassName="text-xs sm:text-sm"
      align="center"
      actions={
        <Switch
          checked={allRulesEnabled}
          onCheckedChange={(enabled) => execute({ enabled })}
          disabled={isExecuting}
        />
      }
    />
  );
}
