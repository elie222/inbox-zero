"use client";

import { AppAlertBanner } from "@/app/(app)/AppAlertBanner";
import { EndTrialButton } from "@/components/EndTrialButton";
import { useAiAutomationStatus } from "@/hooks/useAiAutomationStatus";

export function AiAutomationStatusBanner() {
  const { data: status } = useAiAutomationStatus();

  if (status?.status !== "trial_ai_limit_reached") return null;

  return (
    <AppAlertBanner
      title="Action Required"
      description={status.message}
      action={<EndTrialButton variant="red" size="sm" />}
    />
  );
}
