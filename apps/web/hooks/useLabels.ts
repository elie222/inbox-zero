import { useMemo } from "react";
import useSWR from "swr";
import type { LabelsResponse } from "@/app/api/labels/route";
import type { EmailLabel } from "@/providers/email-label-types";
import { useAccount } from "@/providers/EmailAccountProvider";
import { compareLabelsByName } from "@/utils/label/compare-labels";

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

function isHidden(label: EmailLabel): boolean {
  return label.labelListVisibility === "labelHide";
}

function useLabelsResponse() {
  const {
    emailAccount,
    isLoading: isLoadingEmailAccount,
    providerRateLimit,
  } = useAccount();
  const swr = useSWR<LabelsResponse>(
    !isLoadingEmailAccount && emailAccount && !providerRateLimit
      ? "/api/labels"
      : null,
    { shouldRetryOnError: false },
  );

  return {
    ...swr,
    isLoading: isLoadingEmailAccount || swr.isLoading,
  };
}

export function useAllLabels() {
  const { data, isLoading, error, mutate } = useLabelsResponse();

  const userLabels = useMemo(() => {
    if (!data?.labels) return [];

    return data.labels
      .filter((label) => label.type === "user")
      .sort(compareLabelsByName);
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
  const { data, isLoading, error, mutate } = useLabelsResponse();

  const userLabels: EmailLabel[] = useMemo(() => {
    if (!data?.labels) return [];

    return data.labels
      .filter((label) => label.type === "user")
      .map((label) => ({
        id: label.id || "",
        name: label.name || "",
        type: label.type || null,
        color: label.color,
        labelListVisibility: label.labelListVisibility,
        messageListVisibility: label.messageListVisibility,
      }))
      .sort(compareLabelsByName);
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

  const { visibleLabels, hiddenLabels } = useMemo(() => {
    // Split labels into visible and hidden categories
    const visible: EmailLabel[] = [];
    const hidden: EmailLabel[] = [];

    userLabels.forEach((label) => {
      if (isHidden(label)) {
        hidden.push(label);
      } else {
        visible.push(label);
      }
    });

    return {
      visibleLabels: visible,
      hiddenLabels: hidden,
    };
  }, [userLabels]);

  return {
    visibleLabels,
    hiddenLabels,
    isLoading,
    error,
    mutate,
  };
}
