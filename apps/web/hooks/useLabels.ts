import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/google/labels/route";

export function useLabels() {
  const { data, isLoading, error, mutate } =
    useSWR<LabelsResponse>("/api/google/labels");

  const userLabels = useMemo(
    () =>
      data?.labels
        ?.filter((l) => l.id && l.type === "user")
        .sort((a, b) => {
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
