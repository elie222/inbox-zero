"use client";

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
import { SettingsSection } from "@/components/SettingsSection";
import { Separator } from "@/components/ui/separator";
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

  const hasEnabledRules = rules?.some((rule) => rule.enabled) ?? false;
  const hasRules = (rules?.length ?? 0) > 0;

  const { execute, isExecuting } = useAction(
    toggleAllRulesAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "All rules disabled" });
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
      <SettingsSection
        title="Disable All Rules"
        description="Disable all AI rules for this account. You can re-enable rules individually."
        titleClassName="text-sm"
        descriptionClassName="text-xs sm:text-sm"
        align="center"
        actions={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={isExecuting}>
                Disable All
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disable all rules?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will disable all AI rules for this account. You can
                  re-enable individual rules from the Rules page.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction type="button" onClick={() => execute({ enabled: false })}>
                  Disable All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        }
      />
      <Separator />
    </>
  );
}
