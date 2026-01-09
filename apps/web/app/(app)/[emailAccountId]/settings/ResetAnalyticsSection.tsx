"use client";

import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import { resetAnalyticsAction } from "@/utils/actions/user";
import { useAccount } from "@/providers/EmailAccountProvider";

export function ResetAnalyticsSection() {
  const { emailAccountId } = useAccount();
  const { executeAsync: executeResetAnalytics } = useAction(
    resetAnalyticsAction.bind(null, emailAccountId),
  );

  return (
    <SettingCard
      title="Reset Analytics"
      description="Reset analytics for this account. This action is not reversible. All analytics related to this account will be deleted permanently."
      right={
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
      }
    />
  );
}
