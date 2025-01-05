"use client";

import { useEffect } from "react";
import { Crisp } from "crisp-sdk-web";
import { env } from "@/env";

const CrispChat = ({ email }: { email?: string }) => {
  useEffect(() => {
    if (env.NEXT_PUBLIC_CRISP_WEBSITE_ID) {
      Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
      Crisp.setHideOnMobile(true);
      if (email) Crisp.user.setEmail(email);
    }
  }, [email]);

  return null;
};

export default CrispChat;
