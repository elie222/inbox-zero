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
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID || env.NEXT_PUBLIC_PRIVACY_MODE)
      return;

    Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
    Crisp.setHideOnMobile(true);
    setIsConfigured(true);
  }, []);

  const { userEmail } = useAccount();

  useEffect(() => {
    if (
      !env.NEXT_PUBLIC_CRISP_WEBSITE_ID ||
      !isConfigured ||
      env.NEXT_PUBLIC_PRIVACY_MODE
    )
      return;

    if (userEmail) Crisp.user.setEmail(userEmail);
  }, [userEmail, isConfigured]);

  useEffect(() => {
    if (
      !env.NEXT_PUBLIC_CRISP_WEBSITE_ID ||
      !isConfigured ||
      env.NEXT_PUBLIC_PRIVACY_MODE
    )
      return;

    if (isChatOpen) {
      Crisp.chat.hide();
    } else {
      Crisp.chat.show();
    }
  }, [isConfigured, isChatOpen]);

  if (env.NEXT_PUBLIC_PRIVACY_MODE) return null;
  return null;
};

// This is used to show the Crisp chat when the user is logged out, and auto opens to help the user
export const CrispChatLoggedOutVisible = () => {
  useEffect(() => {
    if (!env.NEXT_PUBLIC_CRISP_WEBSITE_ID || env.NEXT_PUBLIC_PRIVACY_MODE)
      return;
    Crisp.configure(env.NEXT_PUBLIC_CRISP_WEBSITE_ID);
  }, []);

  return null;
};

export default CrispChat;
