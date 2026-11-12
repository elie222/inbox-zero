"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Item,
  ItemContent,
  ItemTitle,
  ItemActions,
  ItemSeparator,
} from "@/components/ui/item";
import { toggleAllRulesAction } from "@/utils/actions/rule";
import { toastError, toastSuccess } from "@/components/Toast";
import { getActionErrorMessage } from "@/utils/error";
import { useRules } from "@/hooks/useRules";

export function ToggleAllRulesSection({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { t } = useLingui();
  const { data: rules, mutate } = useRules(emailAccountId);

  const hasEnabledRules = rules?.some((rule) => rule.enabled) ?? false;
  const hasRules = (rules?.length ?? 0) > 0;

  const { execute, isExecuting } = useAction(
    toggleAllRulesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: t`All rules disabled` });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  if (!hasRules || !hasEnabledRules) return null;

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>
            <Trans>Disable All Rules</Trans>
          </ItemTitle>
        </ItemContent>
        <ItemActions>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={isExecuting}>
                <Trans>Disable All</Trans>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  <Trans>Disable all rules?</Trans>
                </AlertDialogTitle>
                <AlertDialogDescription>
                  <Trans>
                    This will disable all AI rules for this account. You can
                    re-enable individual rules from the Rules page.
                  </Trans>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>
                  <Trans>Cancel</Trans>
                </AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  onClick={() => execute({ enabled: false })}
                >
                  <Trans>Disable All</Trans>
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ItemActions>
      </Item>
    </>
  );
}
