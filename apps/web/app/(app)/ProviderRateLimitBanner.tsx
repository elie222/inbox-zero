"use client";

import { AlertError } from "@/components/Alert";
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
    <div className="mx-auto max-w-screen-xl w-full px-4 mt-6 mb-2">
      <AlertError
        title={`${providerLabel} Is Rate Limiting This Account`}
        description={
          <p className="mt-2">
            Inbox Zero actions are temporarily paused until around{" "}
            <strong>{retryAtLabel}</strong>. This limit is enforced by{" "}
            {providerLabel}, and other apps connected to this mailbox can
            contribute to the same shared limit.
          </p>
        }
      />
    </div>
  );
}
