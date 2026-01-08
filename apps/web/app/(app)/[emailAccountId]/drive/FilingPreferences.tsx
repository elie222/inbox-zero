"use client";

import { useAccount } from "@/providers/EmailAccountProvider";
import { FilingRulesForm } from "./FilingRulesForm";
import { AllowedFolders } from "./AllowedFolders";

export function FilingPreferences() {
  const { emailAccountId } = useAccount();

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <AllowedFolders emailAccountId={emailAccountId} />
      <FilingRulesForm emailAccountId={emailAccountId} />
    </div>
  );
}
