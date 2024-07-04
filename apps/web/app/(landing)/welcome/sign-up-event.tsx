"use client";

import { useEffect } from "react";
import { postRequest } from "@/utils/api";
import { CompleteRegistrationBody } from "@/app/api/user/complete-registration/route";

export const SignUpEvent = () => {
  useEffect(() => {
    postRequest<{}, CompleteRegistrationBody>(
      `/api/user/complete-registration`,
      {},
    );
  }, []);

  return null;
};
