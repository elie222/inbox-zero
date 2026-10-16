"use client";

import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentWithSignatureToggle } from "@/hooks/useSentWithSignatureToggle";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

export function SentWithSignatureSetting() {
  const { enabled, isLoading, error, isExecuting, toggle } =
    useSentWithSignatureToggle();

  if (env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE) {
    return null;
  }

  return (
    <SettingCard
      title={`Include 'Sent with ${BRAND_NAME}'`}
      description={`Add 'Sent with ${BRAND_NAME}' with your referral link after your signature on emails you send from the mail client. Earn a month of credit for each person who signs up with your link.`}
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="sent-with-signature"
            enabled={enabled ?? false}
            onChange={toggle}
            disabled={isLoading || isExecuting}
          />
        </LoadingContent>
      }
    />
  );
}
