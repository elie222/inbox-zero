import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import type { gmail_v1 } from "@googleapis/gmail";
import { labelVisibility } from "@/utils/gmail/constants";

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

export function useAllLabels() {
  const { data, isLoading, error, mutate } =
    useSWR<LabelsResponse>("/api/google/labels");

  const userLabels = useMemo(
    () => data?.labels?.filter(isUserLabel).sort(sortLabels) || [],
    [data?.labels],
  );

  return {
    userLabels,
    data,
    isLoading,
    error,
    mutate,
  };
}

export function useLabels() {
  const { data, isLoading, error, mutate } =
    useSWR<LabelsResponse>("/api/google/labels");

  const userLabels = useMemo(
    () => data?.labels?.filter(isUserLabel).sort(sortLabels) || [],
    [data?.labels],
  );

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
      visibleLabels: userLabels.filter((label) => !isHiddenLabel(label)),
      hiddenLabels: userLabels.filter(isHiddenLabel),
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

function sortLabels(a: UserLabel, b: UserLabel) {
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
