"use client";

import { CreditCardIcon } from "lucide-react";
import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { useAiAutomationStatus } from "@/hooks/useAiAutomationStatus";
import { useEndStripeTrial } from "@/hooks/useEndStripeTrial";

export function AiAutomationStatusBanner() {
  const { data: status } = useAiAutomationStatus();
  const { loading, endTrial } = useEndStripeTrial();

  if (status?.status !== "trial_ai_limit_reached") return null;

  return (
    <div className="mx-auto max-w-screen-xl w-full px-4 mt-6 mb-2">
      <AlertError
        title="Action Required"
        description={
          <div className="flex flex-col gap-3 mt-2">
            <p>{status.message}</p>

            <Button
              loading={loading}
              onClick={endTrial}
              variant="red"
              size="sm"
              className="w-fit"
            >
              <CreditCardIcon className="mr-2 h-4 w-4" />
              Start paid plan now
            </Button>
          </div>
        }
      />
    </div>
  );
}
