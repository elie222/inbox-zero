"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { ChevronDown, Plus, X } from "lucide-react";
import type { GetAllowedActionsResponse } from "@/app/api/agent/allowed-actions/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Combobox } from "@/components/Combobox";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  toggleAllowedActionAction,
  addAllowedActionOptionAction,
  removeAllowedActionOptionAction,
} from "@/utils/actions/agent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useLabels } from "@/hooks/useLabels";

const EMAIL_CAPABILITIES = [
  {
    actionType: "archive",
    label: "Archive",
    description: "Archive emails automatically",
    hasTargets: false,
  },
  {
    actionType: "classify",
    label: "Label",
    description: "Apply labels to categorize emails",
    hasTargets: true,
    targetKind: "label",
  },
  {
    actionType: "move",
    label: "Move",
    description: "Move emails to folders",
    hasTargets: true,
    targetKind: "folder",
  },
  {
    actionType: "markRead",
    label: "Mark Read",
    description: "Mark emails as read",
    hasTargets: false,
  },
  {
    actionType: "draft",
    label: "Draft",
    description: "Create draft replies",
    hasTargets: false,
  },
  {
    actionType: "send",
    label: "Send",
    description: "Send emails (requires approval)",
    hasTargets: false,
  },
  {
    actionType: "forward",
    label: "Forward",
    description: "Forward emails (requires approval)",
    hasTargets: true,
    targetKind: "email_address",
  },
] as const;

export function PermissionsPanel() {
  const { emailAccountId, provider } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GetAllowedActionsResponse>(
    "/api/agent/allowed-actions",
  );

  const { execute: executeToggle, isExecuting: isToggling } = useAction(
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

  const optionsForAction = useCallback(
    (actionType: string) => {
      return (
        data?.allowedActionOptions?.filter(
          (o) => o.actionType === actionType,
        ) ?? []
      );
    },
    [data?.allowedActionOptions],
  );

  const capabilities =
    provider === "google"
      ? EMAIL_CAPABILITIES.filter((cap) => cap.actionType !== "move")
      : EMAIL_CAPABILITIES;

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-1">
        {capabilities.map((cap) => {
          const enabled = isEnabled(cap.actionType);
          const showTargets = cap.hasTargets && enabled;

          return showTargets ? (
            <Collapsible key={cap.actionType}>
              <div className="rounded-lg border">
                <div className="flex items-center justify-between p-4">
                  <div className="flex-1">
                    <span className="font-medium">{cap.label}</span>
                    <p className="text-sm text-muted-foreground">
                      {cap.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={enabled}
                      disabled={isToggling}
                      onCheckedChange={(checked) => {
                        executeToggle({
                          actionType: cap.actionType,
                          enabled: checked,
                        });
                      }}
                    />
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="rounded-md p-1 hover:bg-muted"
                      >
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                      </button>
                    </CollapsibleTrigger>
                  </div>
                </div>
                <CollapsibleContent>
                  <div className="border-t px-4 pb-4 pt-3">
                    <TargetOptions
                      actionType={cap.actionType}
                      targetKind={cap.targetKind}
                      options={optionsForAction(cap.actionType)}
                      provider={provider}
                      emailAccountId={emailAccountId}
                      onMutate={mutate}
                    />
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          ) : (
            <div
              key={cap.actionType}
              className="flex items-center justify-between rounded-lg border p-4"
            >
              <div>
                <span className="font-medium">{cap.label}</span>
                <p className="text-sm text-muted-foreground">
                  {cap.description}
                </p>
              </div>
              <Switch
                checked={enabled}
                disabled={isToggling}
                onCheckedChange={(checked) => {
                  executeToggle({
                    actionType: cap.actionType,
                    enabled: checked,
                  });
                }}
              />
            </div>
          );
        })}
      </div>
    </LoadingContent>
  );
}

type ActionOption = NonNullable<
  GetAllowedActionsResponse["allowedActionOptions"]
>[number];

function TargetOptions({
  actionType,
  targetKind,
  options,
  provider,
  emailAccountId,
  onMutate,
}: {
  actionType: string;
  targetKind: string;
  options: ActionOption[];
  provider: string;
  emailAccountId: string;
  onMutate: () => void;
}) {
  const { userLabels, isLoading: labelsLoading } = useLabels();

  const { execute: executeAdd } = useAction(
    addAllowedActionOptionAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Added" });
        onMutate();
      },
      onError: () => {
        toastError({ description: "Failed to add" });
      },
    },
  );

  const { execute: executeRemove, isExecuting: isRemoving } = useAction(
    removeAllowedActionOptionAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Removed" });
        onMutate();
      },
      onError: () => {
        toastError({ description: "Failed to remove" });
      },
    },
  );

  const comboboxOptions = useMemo(() => {
    const existingIds = new Set(options.map((o) => o.externalId ?? o.name));
    return userLabels
      .filter((label) => !existingIds.has(label.id))
      .map((label) => ({
        value: label.id,
        label: label.name,
      }));
  }, [userLabels, options]);

  const emptyHint =
    targetKind === "label"
      ? "No restrictions \u2014 all labels allowed"
      : targetKind === "folder"
        ? "No restrictions \u2014 all folders allowed"
        : "No restrictions \u2014 can forward to any address";

  return (
    <div className="space-y-3">
      {options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {options.map((option) => (
            <Badge key={option.id} variant="secondary" className="gap-1 pr-1">
              {option.name}
              <button
                type="button"
                disabled={isRemoving}
                onClick={() => executeRemove({ optionId: option.id })}
                className="rounded-full p-0.5 hover:bg-muted-foreground/20"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyHint}</p>
      )}
      {targetKind === "email_address" ? (
        <EmailAddressInput
          onAdd={(email) => {
            executeAdd({
              actionType,
              provider,
              kind: targetKind,
              externalId: null,
              name: email,
            });
          }}
          existingEmails={options.map((o) => o.name)}
        />
      ) : (
        <Combobox
          options={comboboxOptions}
          placeholder={
            targetKind === "label"
              ? "Add allowed label..."
              : "Add allowed folder..."
          }
          emptyText="No labels found"
          loading={labelsLoading}
          onChangeValue={(value) => {
            if (!value) return;
            const label = userLabels.find((l) => l.id === value);
            if (!label) return;
            executeAdd({
              actionType,
              provider,
              kind: targetKind,
              externalId: label.id,
              name: label.name,
            });
          }}
        />
      )}
    </div>
  );
}

function EmailAddressInput({
  onAdd,
  existingEmails,
}: {
  onAdd: (email: string) => void;
  existingEmails: string[];
}) {
  const [value, setValue] = useState("");

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const isDuplicate = existingEmails.includes(value.toLowerCase());

  const handleAdd = () => {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || !isValidEmail || isDuplicate) return;
    onAdd(trimmed);
    setValue("");
  };

  return (
    <div className="flex gap-2">
      <Input
        type="email"
        placeholder="user@example.com"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleAdd();
          }
        }}
        className="h-9"
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!isValidEmail || isDuplicate}
        onClick={handleAdd}
      >
        <Plus className="mr-1 h-3 w-3" />
        Add
      </Button>
    </div>
  );
}
