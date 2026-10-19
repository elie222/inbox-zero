import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { updateSentWithSignatureAction } from "@/utils/actions/email-account";
import { BRAND_NAME } from "@/utils/branding";

export function useSentWithSignatureToggle(emailAccountId?: string) {
  const { emailAccountId: contextAccountId } = useAccount();
  const accountId = emailAccountId ?? contextAccountId;
  const { data, isLoading, error, mutate } = useEmailAccountFull(accountId);

  const { execute, isExecuting } = useAction(
    updateSentWithSignatureAction.bind(null, accountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: `Failed to update 'Sent with ${BRAND_NAME}' setting`,
      }),
    },
  );

  const toggle = useCallback(
    (enabled: boolean) => {
      if (!data) return;

      mutate({ ...data, includeSentWithSignature: enabled }, false);

      execute({ enabled });
    },
    [data, execute, mutate],
  );

  return {
    enabled: data?.includeSentWithSignature,
    isLoading,
    error,
    isExecuting,
    toggle,
  };
}
