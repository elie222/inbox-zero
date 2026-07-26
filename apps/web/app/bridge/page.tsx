"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccounts } from "@/hooks/useAccounts";
import { isThunderbirdProvider } from "@/utils/email/provider-types";

/**
 * Legacy bridge URL. Prefer Assistant → Pending on a Thunderbird account.
 */
export default function BridgeRedirectPage() {
  const router = useRouter();
  const { data, isLoading } = useAccounts();

  useEffect(() => {
    if (isLoading) return;
    const thunderbird = data?.emailAccounts?.find((account) =>
      isThunderbirdProvider(account.account.provider),
    );
    if (thunderbird) {
      router.replace(`/${thunderbird.id}/automation?tab=pending`);
      return;
    }
    router.replace("/accounts");
  }, [data, isLoading, router]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-sm text-muted-foreground">
      Redirecting to Assistant → Pending…
    </div>
  );
}
