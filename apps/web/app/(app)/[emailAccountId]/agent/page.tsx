"use client";

import { useEffect, useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { BotIcon, SparklesIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { TabsToolbar } from "@/components/TabsToolbar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess, toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  DocumentEditor,
  ActivityFeed,
  PermissionToggles,
  useAgentConfig,
  toggleAgentEnabledAction,
  initializeAgentConfigAction,
  getOrCreateMainDocumentAction,
} from "@/providers/email-agent";

export default function AgentPage() {
  const { emailAccountId, isLoading: accountLoading } = useAccount();
  const {
    data: config,
    isLoading: configLoading,
    error,
    mutate,
  } = useAgentConfig();

  // Initialize config and main document if needed
  const { execute: initConfig } = useAction(
    initializeAgentConfigAction.bind(null, emailAccountId),
    {
      onSuccess: () => mutate(),
    },
  );

  const { execute: initMainDoc } = useAction(
    getOrCreateMainDocumentAction.bind(null, emailAccountId),
    {
      onSuccess: () => mutate(),
    },
  );

  useEffect(() => {
    if (
      !accountLoading &&
      emailAccountId &&
      !config &&
      !configLoading &&
      !error
    ) {
      initConfig({});
      initMainDoc({});
    }
  }, [
    accountLoading,
    emailAccountId,
    config,
    configLoading,
    error,
    initConfig,
    initMainDoc,
  ]);

  const { execute: executeToggle, isExecuting } = useAction(
    toggleAgentEnabledAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: config?.enabled
            ? "Agent disabled"
            : "Agent enabled - it will now process incoming emails",
        });
        mutate();
      },
      onError: (error) => {
        toastError({
          description:
            error.error?.serverError || "Failed to update agent status",
        });
        mutate(); // Revert optimistic update
      },
    },
  );

  const handleToggleEnabled = useCallback(
    (enabled: boolean) => {
      // Optimistic update
      if (config) {
        mutate({ ...config, enabled } as typeof config, false);
      }
      executeToggle({ enabled });
    },
    [config, mutate, executeToggle],
  );

  const isLoading = accountLoading || configLoading;

  return (
    <div className="flex flex-col h-full">
      <div className="content-container mb-4">
        <div className="flex items-center justify-between">
          <PageHeader
            title="Claude Agent"
            description="AI-powered email processing with natural language instructions"
          />

          <LoadingContent loading={isLoading} error={error}>
            {config && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {config.enabled ? (
                    <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                      <SparklesIcon className="h-4 w-4" />
                      Active
                    </span>
                  ) : (
                    "Disabled"
                  )}
                </span>
                <Toggle
                  name="agent-enabled"
                  enabled={config.enabled}
                  onChange={handleToggleEnabled}
                  disabled={isExecuting}
                />
              </div>
            )}
          </LoadingContent>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <Tabs defaultValue="instructions" className="h-full flex flex-col">
          <TabsToolbar>
            <div className="w-full overflow-x-auto">
              <TabsList>
                <TabsTrigger value="instructions">
                  <BotIcon className="h-4 w-4 mr-2" />
                  Instructions
                </TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
            </div>
          </TabsToolbar>

          <TabsContent value="instructions" className="flex-1 min-h-0">
            <div className="content-container h-full pb-8">
              <Card className="h-full">
                <CardContent className="p-6 h-full">
                  <LoadingContent loading={isLoading} error={error}>
                    {emailAccountId && (
                      <DocumentEditor emailAccountId={emailAccountId} />
                    )}
                  </LoadingContent>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="flex-1 min-h-0">
            <div className="content-container h-full pb-8">
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="h-full overflow-auto">
                  <ActivityFeed />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="flex-1 overflow-auto">
            <div className="content-container pb-8">
              <Card>
                <CardHeader>
                  <CardTitle>Agent Permissions</CardTitle>
                </CardHeader>
                <CardContent>
                  <LoadingContent loading={isLoading} error={error}>
                    {emailAccountId && (
                      <PermissionToggles emailAccountId={emailAccountId} />
                    )}
                  </LoadingContent>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
