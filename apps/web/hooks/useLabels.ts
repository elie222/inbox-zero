import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import type { gmail_v1 } from "@googleapis/gmail";

export type UserLabel = {
  id: string;
  name: string;
  type: "user";
  labelListVisibility?: string;
  messageListVisibility?: string;
};

export function useLabels(options = { includeHidden: false }) {
  const { data, isLoading, error, mutate } =
    useSWR<LabelsResponse>("/api/google/labels");

  // Get all user labels
  const allUserLabels = useMemo(
    () => data?.labels?.filter(isUserLabel) || [],
    [data?.labels],
  );

  // Split into visible and hidden labels
  const { userLabels, hiddenUserLabels } = useMemo(() => {
    // Always get visible labels
    const visible = allUserLabels
      .filter((label) => label.labelListVisibility !== "labelHide")
      .sort(sortLabels);

    // Only process hidden labels if needed
    const hidden = options.includeHidden
      ? allUserLabels
          .filter((label) => label.labelListVisibility === "labelHide")
          .sort(sortLabels)
      : [];

    return { userLabels: visible, hiddenUserLabels: hidden };
  }, [allUserLabels, options.includeHidden]);

  return {
    userLabels,
    hiddenUserLabels,
    data,
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
