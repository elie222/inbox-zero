"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateSensitiveDataPolicyAction } from "@/utils/actions/settings";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import {
  parseSensitiveDataPolicy,
  type SensitiveDataPolicy,
} from "@/utils/dlp/sensitive-content";

const POLICY_OPTIONS: Array<{
  description: string;
  label: string;
  value: SensitiveDataPolicy;
}> = [
  {
    description: "Send everything to AI without scanning.",
    label: "Off",
    value: "ALLOW",
  },
  {
    description: "Hide credentials and card numbers, then send to AI.",
    label: "Redact",
    value: "REDACT",
  },
  {
    description: "Skip the AI request when sensitive data is found.",
    label: "Block",
    value: "BLOCK",
  },
];

export function SensitiveDataPolicySetting() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const policy = parseSensitiveDataPolicy(data?.sensitiveDataPolicy ?? null);

  const { execute, isExecuting } = useAction(
    updateSensitiveDataPolicyAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Failed to update sensitive data protection setting",
      }),
    },
  );

  const handlePolicyChange = useCallback(
    (value: string) => {
      if (!data) return;

      const nextPolicy = parseSensitiveDataPolicy(value);
      if (nextPolicy === policy) return;

      mutate(
        {
          ...data,
          sensitiveDataPolicy: nextPolicy,
        },
        false,
      );

      execute({ sensitiveDataPolicy: nextPolicy });
    },
    [data, execute, mutate, policy],
  );

  return (
    <SettingCard
      collapseOnMobile
      title="Sensitive data protection"
      description="Prevent credentials and card numbers from being sent to AI."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-10 w-56" />}
        >
          <Select
            value={policy}
            onValueChange={handlePolicyChange}
            disabled={isExecuting || !data}
          >
            <SelectTrigger
              aria-label="Sensitive data protection"
              className="w-full md:w-56"
            >
              <SelectValue>{getPolicyLabel(policy)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="w-72">
              {POLICY_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="items-start py-2"
                >
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {option.description}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </LoadingContent>
      }
    />
  );
}

function getPolicyLabel(policy: SensitiveDataPolicy) {
  return (
    POLICY_OPTIONS.find((option) => option.value === policy)?.label ?? policy
  );
}
