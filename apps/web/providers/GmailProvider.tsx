"use client";

import { LabelsResponse } from "@/app/api/google/labels/route";
import { createContext, useContext, useMemo } from "react";
import useSWR from "swr";

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
  labels: GmailLabels;
  labelsArray: GmailLabel[];
  labelsIsLoading: boolean;
}

const GmailContext = createContext<Context>({
  labels: {},
  labelsArray: [],
  labelsIsLoading: false,
});

export const useGmail = () => useContext<Context>(GmailContext);

export function GmailProvider(props: { children: React.ReactNode }) {
  const { data, isLoading } = useSWR<LabelsResponse>("/api/google/labels");

  const labels = useMemo(() => {
    return (
      data?.labels?.reduce((acc, label) => {
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
  }, [data]);

  const labelsArray = useMemo(() => {
    return Object.values(labels || {});
  }, [labels]);

  const value = useMemo(
    () => ({ labels, labelsArray, labelsIsLoading: isLoading }),
    [labels, labelsArray, isLoading]
  );

  return (
    <GmailContext.Provider value={value}>
      {props.children}
    </GmailContext.Provider>
  );
}
