"use client";

import { useEffect } from "react";
import { whitelistInboxZeroAction } from "@/utils/actions/whitelist";
import {
  analyzeWritingStyleAction,
  assessUserAction,
} from "@/utils/actions/assess";

async function assessUser() {
  const result = await assessUserAction();
  // no need to run this over and over after the first time
  if (!result.skipped) {
    await whitelistInboxZeroAction();
  }
}

export function AssessUser() {
  useEffect(() => {
    assessUser();
    analyzeWritingStyleAction();
  }, []);

  return null;
}
