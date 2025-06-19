import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import type { gmail_v1 } from "@googleapis/gmail";
import { labelVisibility } from "@/utils/gmail/constants";
import { useAccount } from "@/providers/EmailAccountProvider";

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
  type: "user";
  color?: any;
};

export function useAllLabels() {
  const { provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<LabelsResponse>(
    provider === "google" ? "/api/google/labels" : "/api/outlook/labels",
  );

  const userLabels = useMemo(() => {
    if (!data?.labels) return [];

    if (provider === "google") {
      return data.labels.filter(isUserLabel).sort(sortLabels);
    } else {
      return data.labels
        .map((label) => ({
          id: label.id,
          name: label.name,
          type: "user" as const,
          color: label.color,
        }))
        .sort(sortLabels);
    }
  }, [data?.labels, provider]);

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

  console.log("LABELS data", data);

  const userLabels = useMemo(() => {
    if (!data?.labels) return [];

    if (provider === "google") {
      return data.labels.filter(isUserLabel).sort(sortLabels);
    } else {
      return data.labels
        .map((label) => ({
          id: label.id,
          name: label.name,
          type: "user" as const,
          color: label.color,
        }))
        .sort(sortLabels);
    }
  }, [data?.labels, provider]);

  return {
    userLabels,
    isLoading,
    error,
    mutate,
  };
}

export function useSplitLabels() {
  const { userLabels, isLoading, error, mutate } = useLabels();
  const { provider } = useAccount();

  const { visibleLabels, hiddenLabels } = useMemo(
    () => ({
      visibleLabels:
        provider === "google"
          ? userLabels.filter((label) => !isHiddenLabel(label as UserLabel))
          : userLabels, // Outlook doesn't have hidden labels
      hiddenLabels:
        provider === "google"
          ? userLabels.filter((label) => isHiddenLabel(label as UserLabel))
          : [],
    }),
    [userLabels, provider],
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

function isUserLabel(label: gmail_v1.Schema$Label): label is UserLabel {
  return label.type === "user";
}

function isHiddenLabel(label: UserLabel) {
  return label.labelListVisibility === labelVisibility.labelHide;
}
