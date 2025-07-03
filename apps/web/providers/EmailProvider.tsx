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

export function EmailProvider(props: { children: React.ReactNode }) {
  const { provider } = useAccount();
  const { userLabels: rawUserLabels, isLoading } = useLabels();

  const userLabels = useMemo(() => {
    if (!rawUserLabels) return {};

    return rawUserLabels.reduce((acc, label) => {
      if (label.id && label.name) {
        let color: EmailLabel["color"];

        if (provider === "google") {
          // For Google, color is already in the correct format
          color = label.color;
        } else {
          // For Outlook, map the preset color string to actual color value
          const presetColor = label.color as string;
          const backgroundColor =
            OUTLOOK_COLOR_MAP[presetColor as keyof typeof OUTLOOK_COLOR_MAP] ||
            "#95A5A6"; // Default gray if preset not found

          color = {
            backgroundColor,
            textColor: null,
          };
        }

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
  }, [rawUserLabels, provider]);

  const value = useMemo(
    () => ({ userLabels, labelsIsLoading: isLoading }),
    [userLabels, isLoading],
  );

  return (
    <EmailContext.Provider value={value}>
      {props.children}
    </EmailContext.Provider>
  );
}
