"use client";

import useSWR from "swr";
import Link from "next/link";
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

export function EmailOtpSection() {
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
            <ItemTitle>Email code sign-in</ItemTitle>
            <ItemDescription className="line-clamp-none">
              Allow anyone who can read {data.email} to sign in using an emailed
              code. This gives access to your entire Inbox Zero account,
              including all connected mailboxes, calendars, and settings.
              Activity appears under your name.
            </ItemDescription>
            <ItemDescription className="line-clamp-none">
              Your assistant can select “Sign in with email code” on the{" "}
              <Link href="/login">login page</Link>. Turning this off ends
              code-based sessions. Removing Gmail delegation alone does not sign
              them out.
            </ItemDescription>
            {!data.canManage && (
              <ItemDescription className="line-clamp-none">
                Sign in with your connected provider to change this setting.
              </ItemDescription>
            )}
            {!data.emailDeliveryConfigured && (
              <ItemDescription className="line-clamp-none">
                Email delivery is not configured. Contact your administrator.
              </ItemDescription>
            )}
          </ItemContent>
          <ItemActions>
            <Switch
              aria-label="Email code sign-in"
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
