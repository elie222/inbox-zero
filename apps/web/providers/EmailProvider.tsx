"use client";

import { createContext, useContext, useMemo } from "react";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { OUTLOOK_COLOR_MAP } from "@/utils/outlook/label";

export type EmailLabel = {
  id: string;
  name: string;
  type?: string | null;
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
  labelListVisibility?: string;
  messageListVisibility?: string;
};

export type EmailLabels = Record<string, EmailLabel>;

interface Context {
  userLabels: EmailLabels;
  labelsIsLoading: boolean;
}

const EmailContext = createContext<Context>({
  userLabels: {},
  labelsIsLoading: false,
});

export const useEmail = () => useContext<Context>(EmailContext);

function mapLabelColor(provider: string, label: any): EmailLabel["color"] {
  if (!provider) {
    return undefined;
  }

  if (provider === "google") {
    return label.color;
  } else if (provider === "microsoft-entra-id") {
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
