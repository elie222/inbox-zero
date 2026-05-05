"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccounts } from "@/hooks/useAccounts";
import { getActionErrorMessage } from "@/utils/error";
import { updateAiSensitiveContentPolicyAction } from "@/utils/actions/settings";
import {
  parseAiSensitiveContentPolicy,
  type AiSensitiveContentPolicy,
} from "@/utils/dlp/sensitive-content";

const POLICY_OPTIONS: Array<{
  description: string;
  label: string;
  value: AiSensitiveContentPolicy;
}> = [
  {
    description: "Send AI requests without this scanner.",
    label: "Off",
    value: "ALLOW",
  },
  {
    description: "Replace matched values before AI requests.",
    label: "Redact before AI",
    value: "REDACT",
  },
  {
    description: "Stop AI requests when a match is found.",
    label: "Block AI requests",
    value: "BLOCK",
  },
];

export function AiSensitiveContentPolicySection({
  emailAccountId,
  emailAccountEmail,
  aiSensitiveContentPolicy,
  managed,
}: {
  emailAccountId: string;
  emailAccountEmail: string;
  aiSensitiveContentPolicy: string | null;
  managed?: boolean;
}) {
  const savedPolicy = parseAiSensitiveContentPolicy(aiSensitiveContentPolicy);
  const { data, mutate } = useAccounts();

  const { execute, isExecuting } = useAction(
    updateAiSensitiveContentPolicyAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings updated!" });
      },
      onError: (error) => {
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
      },
      onSettled: () => {
        mutate();
      },
    },
  );

  const handlePolicyChange = useCallback(
    (value: string) => {
      const nextPolicy = parseAiSensitiveContentPolicy(value);
      if (nextPolicy === savedPolicy) return;

      if (data) {
        mutate(
          {
            ...data,
            emailAccounts: data.emailAccounts.map((account) =>
              account.id === emailAccountId
                ? { ...account, aiSensitiveContentPolicy: nextPolicy }
                : account,
            ),
          },
          false,
        );
      }

      execute({ aiSensitiveContentPolicy: nextPolicy });
    },
    [data, emailAccountId, execute, mutate, savedPolicy],
  );

  return (
    <Item size="sm">
      <ItemContent>
        <ItemTitle>Sensitive AI content</ItemTitle>
        <ItemDescription>
          {managed
            ? `Managed by the deployment for ${emailAccountEmail}.`
            : `Detect likely credentials and payment card numbers before AI requests for ${emailAccountEmail}.`}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="w-full sm:w-auto">
        {managed ? (
          <div className="text-right">
            <div className="text-sm font-medium">
              {getPolicyLabel(savedPolicy)}
            </div>
            <div className="text-xs text-muted-foreground">
              Deployment managed
            </div>
          </div>
        ) : (
          <Select
            value={savedPolicy}
            onValueChange={handlePolicyChange}
            disabled={isExecuting}
          >
            <SelectTrigger
              aria-label={`Sensitive AI content policy for ${emailAccountEmail}`}
              className="w-full sm:w-56"
            >
              <SelectValue>{getPolicyLabel(savedPolicy)}</SelectValue>
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
        )}
      </ItemActions>
    </Item>
  );
}

function getPolicyLabel(policy: AiSensitiveContentPolicy) {
  return (
    POLICY_OPTIONS.find((option) => option.value === policy)?.label ?? policy
  );
}
