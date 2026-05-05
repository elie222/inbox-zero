"use client";

import { useEffect, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemSeparator,
  ItemTitle,
} from "@/components/ui/item";
import { Select } from "@/components/Select";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccounts } from "@/hooks/useAccounts";
import { getActionErrorMessage } from "@/utils/error";
import { updateAiSensitiveContentPolicyAction } from "@/utils/actions/settings";
import {
  parseAiSensitiveContentPolicy,
  type AiSensitiveContentPolicy,
} from "@/utils/dlp/sensitive-content";

const POLICY_OPTIONS: Array<{
  label: string;
  value: AiSensitiveContentPolicy;
}> = [
  { label: "Off", value: "ALLOW" },
  { label: "Redact before AI", value: "REDACT" },
  { label: "Block AI requests", value: "BLOCK" },
];

export function AiSensitiveContentPolicySection({
  emailAccountId,
  aiSensitiveContentPolicy,
  managed,
}: {
  emailAccountId: string;
  aiSensitiveContentPolicy: string | null;
  managed?: boolean;
}) {
  const savedPolicy = parseAiSensitiveContentPolicy(aiSensitiveContentPolicy);
  const [policy, setPolicy] = useState<AiSensitiveContentPolicy>(savedPolicy);
  const { mutate } = useAccounts();

  useEffect(() => {
    setPolicy(savedPolicy);
  }, [savedPolicy]);

  const { execute, isExecuting } = useAction(
    updateAiSensitiveContentPolicyAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings updated!" });
        mutate();
      },
      onError: (error) => {
        setPolicy(savedPolicy);
        toastError({
          description: getActionErrorMessage(error.error, {
            prefix: "Failed to update settings",
          }),
        });
      },
    },
  );

  const isDirty = policy !== savedPolicy;

  return (
    <>
      <ItemSeparator />
      <Item size="sm">
        <ItemContent>
          <ItemTitle>Sensitive AI content</ItemTitle>
          <ItemDescription>
            {managed
              ? "Managed by the deployment for all AI requests."
              : "Detect likely credentials and payment card numbers before AI requests for this account."}
          </ItemDescription>
        </ItemContent>
        <ItemActions className="w-full flex-col items-stretch sm:w-auto sm:flex-row sm:items-center">
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
            <>
              <div className="min-w-44">
                <Select
                  name={`ai-sensitive-content-policy-${emailAccountId}`}
                  label="Policy"
                  options={POLICY_OPTIONS}
                  value={policy}
                  onChange={(event) =>
                    setPolicy(event.target.value as AiSensitiveContentPolicy)
                  }
                  disabled={isExecuting}
                />
              </div>
              <Button
                size="sm"
                type="button"
                disabled={!isDirty || isExecuting}
                loading={isExecuting}
                onClick={() => execute({ aiSensitiveContentPolicy: policy })}
              >
                <SaveIcon className="mr-2 size-4" />
                Save
              </Button>
            </>
          )}
        </ItemActions>
      </Item>
    </>
  );
}

function getPolicyLabel(policy: AiSensitiveContentPolicy) {
  return (
    POLICY_OPTIONS.find((option) => option.value === policy)?.label ?? policy
  );
}
