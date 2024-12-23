"use client";

import { useEffect } from "react";
import type { AssessUserResponse } from "@/app/api/user/assess/route";
import { postRequest } from "@/utils/api";
import { whitelistInboxZeroAction } from "@/utils/actions/whitelist";

export function AssessUser() {
  useEffect(() => {
    postRequest<AssessUserResponse>("/api/user/assess", {});
  }, []);

  useEffect(() => {
    whitelistInboxZeroAction();
  }, []);

  return null;
}
