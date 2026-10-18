"use client";

import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  analyzeWritingStyleAction,
  assessAction,
} from "@/utils/actions/assess";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useOrgAccess } from "@/hooks/useOrgAccess";

export function AssessUser() {
  const { emailAccountId } = useAccount();
  const isOnboarding = usePathname().includes("/onboarding");
  const { isAccountOwner } = useOrgAccess();
  const { executeAsync: executeAssessAsync } = useAction(
    assessAction.bind(null, emailAccountId),
  );
  const { execute: executeAnalyzeWritingStyle } = useAction(
    analyzeWritingStyleAction.bind(null, emailAccountId),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: only run once
  useEffect(() => {
    // Skip assessment when an admin is viewing someone else's account
    if (!emailAccountId || !isAccountOwner || isOnboarding) return;

    executeAssessAsync().catch(() => undefined);
    executeAnalyzeWritingStyle();
  }, [emailAccountId, isAccountOwner, isOnboarding]);

  return null;
}
