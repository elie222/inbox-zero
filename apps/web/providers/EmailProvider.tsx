"use client";

import { createContext, useContext, useMemo } from "react";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { EmailLabel, EmailLabels } from "@/providers/email-label-types";
import { OUTLOOK_COLOR_MAP } from "@/utils/outlook/label";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

interface Context {
  labelsIsLoading: boolean;
  userLabels: EmailLabels;
}

const EmailContext = createContext<Context>({
  userLabels: {},
  labelsIsLoading: false,
});

export const useEmail = () => useContext<Context>(EmailContext);

// biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
function mapLabelColor(provider: string, label: any): EmailLabel["color"] {
  if (!provider) {
    return;
  }

  if (isGoogleProvider(provider)) {
    return label.color;
  } else if (isMicrosoftProvider(provider)) {
    const presetColor = label.color as string;
    const backgroundColor =
      OUTLOOK_COLOR_MAP[presetColor as keyof typeof OUTLOOK_COLOR_MAP] ||
      "#95A5A6"; // Default gray if preset not found

    return {
      backgroundColor,
      textColor: null,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export function EmailProvider(props: { children: React.ReactNode }) {
  const { provider, isLoading: accountIsLoading } = useAccount();
  const { userLabels: rawUserLabels, isLoading } = useLabels();

  const userLabels = useMemo(() => {
    if (!rawUserLabels || !provider || accountIsLoading) return {};

    return rawUserLabels.reduce((acc, label) => {
      if (label.id && label.name) {
        const color = mapLabelColor(provider, label);

        acc[label.id] = {
          id: label.id,
          name: label.name,
          type: label.type,
          color,
          labelListVisibility: label.labelListVisibility,
          messageListVisibility: label.messageListVisibility,
        };
      }
      return acc;
    }, {} as EmailLabels);
  }, [rawUserLabels, provider, accountIsLoading]);

  const value = useMemo(
    () => ({ userLabels, labelsIsLoading: isLoading || accountIsLoading }),
    [userLabels, isLoading, accountIsLoading],
  );

  return (
    <EmailContext.Provider value={value}>
      {props.children}
    </EmailContext.Provider>
  );
}
