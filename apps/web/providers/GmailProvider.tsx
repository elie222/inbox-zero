"use client";

import { createContext, useContext, useMemo } from "react";
import { useLabels } from "@/hooks/useLabels";

export type GmailLabel = {
  id: string;
  name: string;
  type?: string | null;
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
};

export type GmailLabels = Record<string, GmailLabel>;

interface Context {
  userLabels: GmailLabels;
  labelsIsLoading: boolean;
}

const GmailContext = createContext<Context>({
  userLabels: {},
  labelsIsLoading: false,
});

export const useGmail = () => useContext<Context>(GmailContext);

export function GmailProvider(props: { children: React.ReactNode }) {
  const { userLabels: gmailUserLabels, isLoading } = useLabels();

  const userLabels = useMemo(() => {
    return (
      gmailUserLabels?.reduce((acc, label) => {
        if (label.id && label.name) {
          acc[label.id] = {
            id: label.id,
            name: label.name,
            type: label.type,
            color: label.color,
          };
        }
        return acc;
      }, {} as GmailLabels) || {}
    );
  }, [gmailUserLabels]);

  const value = useMemo(
    () => ({ userLabels, labelsIsLoading: isLoading }),
    [userLabels, isLoading],
  );

  return (
    <GmailContext.Provider value={value}>
      {props.children}
    </GmailContext.Provider>
  );
}
