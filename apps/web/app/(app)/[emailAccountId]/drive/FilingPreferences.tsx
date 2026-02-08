"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { FilingRulesForm } from "./FilingRulesForm";
import { AllowedFolders } from "./AllowedFolders";
import { FilingNotificationChannels } from "./FilingNotificationChannels";

export function FilingPreferences() {
  const { emailAccountId } = useAccount();

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <AllowedFolders emailAccountId={emailAccountId} />
        <FilingRulesForm emailAccountId={emailAccountId} />
      </div>
      <FilingNotificationChannels emailAccountId={emailAccountId} />
    </div>
  );
}
