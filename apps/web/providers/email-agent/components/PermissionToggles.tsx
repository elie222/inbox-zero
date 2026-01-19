"use client";

import { useState, useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { PlusIcon, XIcon } from "lucide-react";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAgentConfig } from "../hooks/useAgentConfig";
import { updateAgentConfigAction } from "../actions/agent-actions";
import type { AgentConfig } from "../types";

interface PermissionTogglesProps {
  emailAccountId: string;
}

export function PermissionToggles({ emailAccountId }: PermissionTogglesProps) {
  const { data: config, isLoading, error, mutate } = useAgentConfig();

  const { execute, isExecuting } = useAction(
    updateAgentConfigAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Settings updated" });
        mutate();
      },
      onError: (error) => {
        toastError({
          description: error.error?.serverError || "Failed to update settings",
        });
        mutate(); // Revert optimistic update
      },
    },
  );

  const handleToggle = useCallback(
    (key: keyof AgentConfig, value: boolean) => {
      // Optimistic update
      if (config) {
        mutate({ ...config, [key]: value } as typeof config, false);
      }
      execute({ [key]: value });
    },
    [config, mutate, execute],
  );

  const handleForwardListUpdate = useCallback(
    (emails: string[]) => {
      if (config) {
        mutate({ ...config, forwardAllowList: emails } as typeof config, false);
      }
      execute({ forwardAllowList: emails });
    },
    [config, mutate, execute],
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {config && (
        <div className="space-y-4">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Email Actions
          </h3>

          <SettingCard
            title="Label emails"
            description="Allow the agent to apply labels to emails"
            right={
              <Toggle
                name="canLabel"
                enabled={config.canLabel}
                onChange={(v) => handleToggle("canLabel", v)}
                disabled={isExecuting}
              />
            }
          />

          <SettingCard
            title="Archive emails"
            description="Allow the agent to archive emails (remove from inbox)"
            right={
              <Toggle
                name="canArchive"
                enabled={config.canArchive}
                onChange={(v) => handleToggle("canArchive", v)}
                disabled={isExecuting}
              />
            }
          />

          <SettingCard
            title="Draft replies"
            description="Allow the agent to create draft email replies"
            right={
              <Toggle
                name="canDraftReply"
                enabled={config.canDraftReply}
                onChange={(v) => handleToggle("canDraftReply", v)}
                disabled={isExecuting}
              />
            }
          />

          <SettingCard
            title="Mark as read"
            description="Allow the agent to mark emails as read"
            right={
              <Toggle
                name="canMarkRead"
                enabled={config.canMarkRead}
                onChange={(v) => handleToggle("canMarkRead", v)}
                disabled={isExecuting}
              />
            }
          />

          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide pt-4">
            Advanced
          </h3>

          <SettingCard
            title="Web search"
            description="Allow the agent to search the web for information"
            right={
              <Toggle
                name="canWebSearch"
                enabled={config.canWebSearch}
                onChange={(v) => handleToggle("canWebSearch", v)}
                disabled={isExecuting}
              />
            }
          />

          <SettingCard
            title="Create labels"
            description="Allow the agent to create new labels in Gmail"
            right={
              <Toggle
                name="canCreateLabel"
                enabled={config.canCreateLabel}
                onChange={(v) => handleToggle("canCreateLabel", v)}
                disabled={isExecuting}
              />
            }
          />

          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide pt-4">
            Forward Allowlist
          </h3>

          <ForwardAllowListEditor
            emails={config.forwardAllowList}
            onUpdate={handleForwardListUpdate}
            disabled={isExecuting}
          />
        </div>
      )}
    </LoadingContent>
  );
}

interface ForwardAllowListEditorProps {
  emails: string[];
  onUpdate: (emails: string[]) => void;
  disabled?: boolean;
}

function ForwardAllowListEditor({
  emails,
  onUpdate,
  disabled,
}: ForwardAllowListEditorProps) {
  const [newEmail, setNewEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = useCallback(() => {
    const email = newEmail.trim().toLowerCase();

    if (!email) return;

    // Basic email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address");
      return;
    }

    if (emails.includes(email)) {
      setError("This email is already in the list");
      return;
    }

    setError(null);
    onUpdate([...emails, email]);
    setNewEmail("");
  }, [newEmail, emails, onUpdate]);

  const handleRemove = useCallback(
    (email: string) => {
      onUpdate(emails.filter((e) => e !== email));
    },
    [emails, onUpdate],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        The agent can only forward emails to addresses in this list. Leave empty
        to disable forwarding.
      </p>

      {emails.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {emails.map((email) => (
            <div
              key={email}
              className="flex items-center gap-1 bg-muted px-2 py-1 rounded-md text-sm"
            >
              <span>{email}</span>
              <button
                type="button"
                onClick={() => handleRemove(email)}
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            type="email"
            name="forward-email"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              setError(null);
            }}
            placeholder="email@example.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            disabled={disabled}
          />
          {error && <p className="text-sm text-destructive mt-1">{error}</p>}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={disabled || !newEmail.trim()}
        >
          <PlusIcon className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
