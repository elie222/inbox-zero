"use client";

import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { whitelistInboxZeroAction } from "@/utils/actions/whitelist";
import {
  analyzeWritingStyleAction,
  assessAction,
} from "@/utils/actions/assess";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useOrgAccess } from "@/hooks/useOrgAccess";

export function AssessUser() {
  const { emailAccountId, provider } = useAccount();
  const { isAccountOwner } = useOrgAccess();
  const { executeAsync: executeAssessAsync } = useAction(
    assessAction.bind(null, emailAccountId),
  );
  const { execute: executeWhitelistInboxZero } = useAction(
    whitelistInboxZeroAction.bind(null, emailAccountId),
  );
  const { execute: executeAnalyzeWritingStyle } = useAction(
    analyzeWritingStyleAction.bind(null, emailAccountId),
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: only run once
  useEffect(() => {
    // Skip assessment when an admin is viewing someone else's account
    if (!emailAccountId || !isAccountOwner) return;

    async function assess() {
      const result = await executeAssessAsync();
      // no need to run this over and over after the first time
      if (!result?.data?.skipped && provider !== "microsoft") {
        executeWhitelistInboxZero();
      }
    }

    assess();
    executeAnalyzeWritingStyle();
  }, [emailAccountId, isAccountOwner]);

  return null;
}
