"use client";

import { useEffect } from "react";
import type { AssessUserResponse } from "@/app/api/user/assess/route";
import { postRequest } from "@/utils/api";

export function AssessUser() {
  useEffect(() => {
    const res = postRequest<AssessUserResponse, {}>(`/api/user/assess`, {});
  }, []);

  return null;
}
