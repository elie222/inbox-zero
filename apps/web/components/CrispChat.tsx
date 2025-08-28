"use client";

import { useEffect, useState } from "react";
import { Crisp } from "crisp-sdk-web";
import { env } from "@/env";
import { useSidebar } from "@/components/ui/sidebar";
import { useAccount } from "@/providers/EmailAccountProvider";

const CrispChat = () => {
  const { state } = useSidebar();

  const [isConfigured, setIsConfigured] = useState(false);
  const isChatOpen = state.includes("chat-sidebar");

  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID) return;

    Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
    Crisp.setHideOnMobile(true);
    setIsConfigured(true);
  }, []);

  const { userEmail } = useAccount();

  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID || !isConfigured) return;

    if (userEmail) Crisp.user.setEmail(userEmail);
  }, [userEmail, isConfigured]);

  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID || !isConfigured) return;

    if (isChatOpen) {
      Crisp.chat.hide();
    } else {
      Crisp.chat.show();
    }
  }, [isConfigured, isChatOpen]);

  return null;
};

export default CrispChat;
