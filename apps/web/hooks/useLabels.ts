import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import { useAccount } from "@/providers/EmailAccountProvider";
import { EmailLabel } from "@/providers/EmailProvider";

export type UserLabel = {
  id: string;
  name: string;
  type: "user";
  labelListVisibility?: string;
  messageListVisibility?: string;
  color?: {
    textColor?: string | null;
    backgroundColor?: string | null;
  };
};

export type OutlookLabel = {
  id: string;
  name: string;
  type: "user";
  color?: string;
};

export type GenericLabel = UserLabel | OutlookLabel;

type SortableLabel = {
  id: string | null | undefined;
  name: string | null | undefined;
  type: string | null;
  color?: any;
};

export function useAllLabels() {
  const { provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<LabelsResponse>(
    provider === "google" ? "/api/google/labels" : "/api/outlook/labels",
  );

  const userLabels = useMemo(() => {
    if (!data?.labels) return [];

    return data.labels
      .filter((label) => label.type === "user")
      .sort(sortLabels);
  }, [data?.labels]);

  return {
    userLabels,
    data,
    isLoading,
    error,
    mutate,
  };
}

export function useLabels() {
  const { provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<LabelsResponse>(
    provider === "google" ? "/api/google/labels" : "/api/outlook/labels",
  );

  const userLabels: EmailLabel[] = useMemo(() => {
    if (!data?.labels) return [];

    return data.labels
      .filter((label) => label.type === "user")
      .map((label) => ({
        id: label.id || "",
        name: label.name || "",
        type: label.type || null,
        color: label.color,
      }))
      .sort(sortLabels);
  }, [data?.labels]);

  return {
    userLabels,
    isLoading,
    error,
    mutate,
  };
}

export function useSplitLabels() {
  const { userLabels, isLoading, error, mutate } = useLabels();

  const { visibleLabels, hiddenLabels } = useMemo(
    () => ({
      visibleLabels: userLabels,
      hiddenLabels: [],
    }),
    [userLabels],
  );

  return {
    visibleLabels,
    hiddenLabels,
    isLoading,
    error,
    mutate,
  };
}

function sortLabels(a: SortableLabel, b: SortableLabel) {
  const aName = a.name || "";
  const bName = b.name || "";

  // Order words that start with [ at the end
  if (aName.startsWith("[") && !bName.startsWith("[")) return 1;
  if (!aName.startsWith("[") && bName.startsWith("[")) return -1;

  return aName.localeCompare(bName);
}
