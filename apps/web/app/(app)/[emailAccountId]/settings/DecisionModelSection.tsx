"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
import { Switch } from "@/components/ui/switch";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { toastError, toastSuccess } from "@/components/Toast";
import { useUser } from "@/hooks/useUser";
import { updateDecisionModelSettingsAction } from "@/utils/actions/settings";
import { getActionErrorMessage } from "@/utils/error";

export function DecisionModelSection() {
  const { t } = useLingui();
  const { data, mutate } = useUser();

  const { execute, isExecuting } = useAction(
    updateDecisionModelSettingsAction,
    {
      onSuccess: () => {
        toastSuccess({ description: t`Settings updated!` });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: t`Failed to update settings`,
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  if (!data) return null;

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>
          <Trans>Specialized decision model</Trans>
        </ItemTitle>
        <ItemDescription>
          <Trans>
            Use an optional decision model for rule matching and other
            structured decisions. Falls back to your AI model if unavailable.
          </Trans>
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Switch
          aria-label={t`Specialized decision model`}
          checked={data.decisionModelEnabled}
          onCheckedChange={(decisionModelEnabled) => {
            mutate({ ...data, decisionModelEnabled }, false);
            execute({ decisionModelEnabled });
          }}
          disabled={isExecuting}
        />
      </ItemActions>
    </Item>
  );
}
