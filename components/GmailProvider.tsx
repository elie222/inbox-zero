"use client";

import { LabelsResponse } from "@/app/api/google/labels/route";
import { createContext, useContext, useMemo } from "react";
import useSWR from "swr";

type Label = Record<string, { name: string; type?: string | null }>;

interface Context {
  labels?: Label;
}

const GmailContext = createContext<Context>({
  labels: {},
});

export const useGmail = () => useContext<Context>(GmailContext);

export function GmailProvider(props: { children: React.ReactNode }) {
  const { data } = useSWR<LabelsResponse>("/api/google/labels");

  const labels = useMemo(() => {
    return data?.labels?.reduce((acc, label) => {
      if (label.id && label.name) {
        acc[label.id] = { name: label.name, type: label.type };
      }
      return acc;
    }, {} as Label);
  }, [data]);

  return (
    <GmailContext.Provider value={{ labels }}>
      {props.children}
    </GmailContext.Provider>
  );
}
