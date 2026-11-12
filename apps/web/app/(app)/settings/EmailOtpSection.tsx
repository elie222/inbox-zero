"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import type { EmailOtpSettingsResponse } from "@/app/api/user/email-otp/route";
import { updateEmailOtpAction } from "@/utils/actions/email-otp";
import { getActionErrorMessage } from "@/utils/error";
import { toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import { Switch } from "@/components/ui/switch";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";

export function EmailOtpSection({
  hasMultipleAccounts,
}: {
  hasMultipleAccounts: boolean;
}) {
  const { t } = useLingui();
  const { data, isLoading, error, mutate } = useSWR<EmailOtpSettingsResponse>(
    "/api/user/email-otp",
  );
  const { execute, isExecuting } = useAction(updateEmailOtpAction, {
    onSuccess: () => {
      mutate();
    },
    onError: ({ error }) =>
      toastError({ description: getActionErrorMessage(error) }),
  });

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <Item size="sm">
          <ItemContent>
            <ItemTitle>
              <Trans>Allow sign-in with a one-time email code</Trans>
            </ItemTitle>
            {data.emailOtpEnabled && hasMultipleAccounts && (
              <ItemDescription className="line-clamp-none break-all">
                <Trans>Sign in with {data.email}.</Trans>
              </ItemDescription>
            )}
            {!data.emailDeliveryConfigured && (
              <ItemDescription className="line-clamp-none">
                <Trans>Email delivery unavailable.</Trans>
              </ItemDescription>
            )}
          </ItemContent>
          <ItemActions>
            <Switch
              aria-label={t`Allow sign-in with a one-time email code`}
              checked={data.emailOtpEnabled}
              disabled={
                isExecuting ||
                !data.canManage ||
                (!data.emailDeliveryConfigured && !data.emailOtpEnabled)
              }
              onCheckedChange={(enabled) => execute({ enabled })}
            />
          </ItemActions>
        </Item>
      )}
    </LoadingContent>
  );
}
