"use client";

import { CreditCardIcon } from "lucide-react";
import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { Button } from "@/components/ui/button";
import { useAiAutomationStatus } from "@/hooks/useAiAutomationStatus";
import { useEndStripeTrial } from "@/hooks/useEndStripeTrial";

export function AiAutomationStatusBanner() {
  const { data: status } = useAiAutomationStatus();
  const { loading, endTrial } = useEndStripeTrial();

  if (status?.status !== "trial_ai_limit_reached") return null;

  return (
    <AppAlertBanner
      title="Action Required"
      description={status.message}
      action={
        <Button loading={loading} onClick={endTrial} variant="red" size="sm">
          <CreditCardIcon className="mr-2 h-4 w-4" />
          Start paid plan now
        </Button>
      }
    />
  );
}
