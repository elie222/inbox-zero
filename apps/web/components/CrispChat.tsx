"use client";

import { useEffect, useState } from "react";
import { Crisp } from "crisp-sdk-web";
import { usePathname } from "next/navigation";
import { env } from "@/env";

const CrispChat = ({ email }: { email?: string }) => {
  const pathname = usePathname();

  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID) return;

    Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
    Crisp.setHideOnMobile(true);
    setIsConfigured(true);
  }, []);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID || !isConfigured) return;

    if (email) Crisp.user.setEmail(email);
  }, [email, isConfigured]);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID || !isConfigured) return;

    if (
      pathname.includes("/assistant") ||
      pathname.includes("/automation") ||
      pathname.includes("/reply-zero")
    ) {
      Crisp.chat.hide();
    } else {
      Crisp.chat.show();
    }
  }, [pathname, isConfigured]);

  return null;
};

export default CrispChat;
