"use client";

import Link from "next/link";
import { AlertError } from "@/components/Alert";
import { Button } from "@/components/ui/button";
import { useAiAutomationStatus } from "@/hooks/useAiAutomationStatus";

export function AiAutomationStatusBanner() {
  const { data: status } = useAiAutomationStatus();

  if (status?.status !== "trial_ai_limit_reached") return null;

  return (
    <div className="mx-auto max-w-screen-xl w-full px-4 mt-6 mb-2 space-y-2">
      <AlertError
        title="Action Required"
        description={
          <div className="flex flex-col gap-3 mt-2">
            <p>{status.message}</p>

            <Button asChild variant="red" size="sm" className="w-fit">
              <Link href="/premium">Upgrade</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
