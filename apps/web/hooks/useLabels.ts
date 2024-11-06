import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/google/labels/route";
import type { gmail_v1 } from "@googleapis/gmail";

export type UserLabel = { id: string; name: string; type: "user" };

export function useLabels() {
  const { data, isLoading, error, mutate } =
    useSWR<LabelsResponse>("/api/google/labels");

  const userLabels = useMemo(
    () =>
      data?.labels?.filter(isUserLabel).sort((a, b) => {
        const aName = a.name || "";
        const bName = b.name || "";

        // order words that start with [ at the end
        if (aName.startsWith("[") && !bName.startsWith("[")) return 1;
        if (!aName.startsWith("[") && bName.startsWith("[")) return -1;

        return aName.localeCompare(bName);
      }) || [],
    [data?.labels],
  );

  return { userLabels, data, isLoading, error, mutate };
}

function isUserLabel(label: gmail_v1.Schema$Label): label is UserLabel {
  return label.type === "user";
}
