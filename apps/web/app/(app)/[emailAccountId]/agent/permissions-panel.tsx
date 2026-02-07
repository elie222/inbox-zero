"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import type { GetAllowedActionsResponse } from "@/app/api/agent/allowed-actions/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Switch } from "@/components/ui/switch";
import { toastSuccess, toastError } from "@/components/Toast";
import { toggleAllowedActionAction } from "@/utils/actions/agent";
import { useAccount } from "@/providers/EmailAccountProvider";

const EMAIL_CAPABILITIES = [
  {
    actionType: "archive",
    label: "Archive",
    description: "Archive emails automatically",
  },
  {
    actionType: "classify",
    label: "Label",
    description: "Apply labels to categorize emails",
  },
  {
    actionType: "move",
    label: "Move",
    description: "Move emails to folders",
  },
  {
    actionType: "markRead",
    label: "Mark Read",
    description: "Mark emails as read",
  },
  {
    actionType: "draft",
    label: "Draft",
    description: "Create draft replies",
  },
  {
    actionType: "send",
    label: "Send",
    description: "Send emails (requires approval)",
  },
] as const;

export function PermissionsPanel() {
  const { emailAccountId, provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GetAllowedActionsResponse>(
    "/api/agent/allowed-actions",
  );

  const { execute, isExecuting } = useAction(
    toggleAllowedActionAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Updated" });
        mutate();
      },
      onError: () => {
        toastError({ description: "Failed to update" });
      },
    },
  );

  const isEnabled = useCallback(
    (actionType: string) => {
      return (
        data?.allowedActions.find((a) => a.actionType === actionType)
          ?.enabled ?? false
      );
    },
    [data?.allowedActions],
  );

  const capabilities =
    provider === "google"
      ? EMAIL_CAPABILITIES.filter((cap) => cap.actionType !== "move")
      : EMAIL_CAPABILITIES;

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-1">
        {capabilities.map((cap) => (
          <div
            key={cap.actionType}
            className="flex items-center justify-between rounded-lg border p-4"
          >
            <div>
              <span className="font-medium">{cap.label}</span>
              <p className="text-sm text-muted-foreground">{cap.description}</p>
            </div>
            <Switch
              checked={isEnabled(cap.actionType)}
              disabled={isExecuting}
              onCheckedChange={(checked) => {
                execute({ actionType: cap.actionType, enabled: checked });
              }}
            />
          </div>
        ))}
      </div>
    </LoadingContent>
  );
}
