"use client";

import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { getProviderRateLimitBannerLabel } from "@/utils/email/rate-limit-mode-error";

export function ProviderRateLimitBanner() {
  const { data, isLoading, error } = useEmailAccountFull();

  if (isLoading || error || !data?.providerRateLimit) return null;

  const { provider, retryAt } = data.providerRateLimit;
  const providerLabel = getProviderRateLimitBannerLabel(provider);

  const retryAtDate = new Date(retryAt);
  const retryAtLabel = Number.isNaN(retryAtDate.getTime())
    ? retryAt
    : retryAtDate.toLocaleString();

  return (
    <AppAlertBanner
      title={`${providerLabel} Is Rate Limiting This Account`}
      description={
        <p>
          Inbox Zero actions are temporarily paused until around{" "}
          <strong>{retryAtLabel}</strong>. This limit is enforced by{" "}
          {providerLabel}, and other apps connected to this mailbox can
          contribute to the same shared limit.
        </p>
      }
    />
  );
}
