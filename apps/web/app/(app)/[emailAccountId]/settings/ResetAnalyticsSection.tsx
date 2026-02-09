"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { resetAnalyticsAction } from "@/utils/actions/user";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ResetAnalyticsSection({
  emailAccountId: emailAccountIdProp,
}: {
  emailAccountId?: string;
} = {}) {
  const { emailAccountId: activeEmailAccountId } = useAccount();
  const emailAccountId = emailAccountIdProp ?? activeEmailAccountId;
  const { executeAsync: executeResetAnalytics } = useAction(
    resetAnalyticsAction.bind(null, emailAccountId),
  );

  return (
    <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-0.5">
        <h3 className="text-sm font-medium">Reset Analytics</h3>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Reset analytics for this account. This action is not reversible. All
          analytics related to this account will be deleted permanently.
        </p>
      </div>

      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          toast.promise(() => executeResetAnalytics(), {
            loading: "Resetting analytics...",
            success: () => {
              return "Analytics reset! Visit the Unsubscriber or Analytics page and click the 'Load More' button to reload your data.";
            },
            error: (err) => {
              return `Error resetting analytics: ${err.message}`;
            },
          });
        }}
      >
        Reset Analytics
      </Button>
    </section>
  );
}
