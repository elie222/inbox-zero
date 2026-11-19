"use client";

import type { I18n, MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
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
  description: MessageDescriptor;
  label: MessageDescriptor;
  value: SensitiveDataPolicy;
}> = [
  {
    description: msg`Send everything to AI without scanning.`,
    label: msg`Off`,
    value: "ALLOW",
  },
  {
    description: msg`Hide credentials and card numbers, then send to AI.`,
    label: msg`Redact`,
    value: "REDACT",
  },
  {
    description: msg`Skip the AI request when sensitive data is found.`,
    label: msg`Block`,
    value: "BLOCK",
  },
];

export function SensitiveDataPolicySetting() {
  const { t, i18n } = useLingui();
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
        prefix: t`Failed to update sensitive data protection setting`,
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
      title={t`Sensitive data protection`}
      description={t`Prevent credentials and card numbers from being sent to AI.`}
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
              aria-label={t`Sensitive data protection`}
              className="w-full md:w-56"
            >
              <SelectValue>{getPolicyLabel(policy, i18n)}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end" className="w-72">
              {POLICY_OPTIONS.map((option) => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                  className="items-start py-2"
                >
                  <div className="flex flex-col text-left">
                    <span className="font-medium">{i18n._(option.label)}</span>
                    <span className="text-xs text-muted-foreground">
                      {i18n._(option.description)}
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

function getPolicyLabel(policy: SensitiveDataPolicy, i18n: I18n) {
  const label = POLICY_OPTIONS.find((option) => option.value === policy)?.label;
  return label ? i18n._(label) : policy;
}
