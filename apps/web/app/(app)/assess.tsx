"use client";

import { useAction } from "next-safe-action/hooks";
import { useEffect } from "react";
import { whitelistInboxZeroAction } from "@/utils/actions/whitelist";
import {
  analyzeWritingStyleAction,
  assessAction,
} from "@/utils/actions/assess";
import { useAccount } from "@/providers/AccountProvider";

export function AssessUser() {
  const { account } = useAccount();
  const { executeAsync: executeAssessAsync } = useAction(
    assessAction.bind(null, account?.email || ""),
  );
  const { execute: executeWhitelistInboxZero } = useAction(
    whitelistInboxZeroAction.bind(null, account?.email || ""),
  );
  const { execute: executeAnalyzeWritingStyle } = useAction(
    analyzeWritingStyleAction.bind(null, account?.email || ""),
  );

  useEffect(() => {
    async function assess() {
      const result = await executeAssessAsync();
      // no need to run this over and over after the first time
      if (!result?.data?.skipped) {
        executeWhitelistInboxZero();
      }
    }

    assess();
    executeAnalyzeWritingStyle();
  }, [
    executeAssessAsync,
    executeWhitelistInboxZero,
    executeAnalyzeWritingStyle,
  ]);

  return null;
}
