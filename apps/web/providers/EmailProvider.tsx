"use client";

import { createContext, useContext, useMemo } from "react";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import type { EmailLabels } from "@/providers/email-label-types";

interface Context {
  labelsIsLoading: boolean;
  userLabels: EmailLabels;
}

const EmailContext = createContext<Context>({
  userLabels: {},
  labelsIsLoading: false,
});

export const useEmail = () => useContext<Context>(EmailContext);

export function EmailProvider(props: { children: React.ReactNode }) {
  const { provider, isLoading: accountIsLoading } = useAccount();
  const { userLabels: rawUserLabels, isLoading } = useLabels();

  const userLabels = useMemo(() => {
    if (!rawUserLabels || !provider || accountIsLoading) return {};

    return rawUserLabels.reduce((acc, label) => {
      if (label.id && label.name) {
        acc[label.id] = {
          id: label.id,
          name: label.name,
          type: label.type,
          color: label.color,
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
