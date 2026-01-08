"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { DynamicSettingsForm } from "@/app/(app)/[emailAccountId]/plugins/components/DynamicSettingsForm";
import { toastError, toastSuccess } from "@/components/Toast";
import { updatePluginSettingsAction } from "@/utils/actions/plugins";
import { fetchPluginManifest } from "@/lib/plugin-library/catalog";
import type { PluginSettings } from "@inbox-zero/plugin-sdk";
import { ArrowLeftIcon } from "lucide-react";

export default function PluginSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const pluginId = params.pluginId as string;
  const emailAccountId = params.emailAccountId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [settingsSchema, setSettingsSchema] = useState<PluginSettings | null>(
    null,
  );
  const [pluginName, setPluginName] = useState<string>("");
  const [currentSettings, setCurrentSettings] = useState<
    Record<string, unknown>
  >({});

  useEffect(() => {
    async function loadPluginSchema() {
      try {
        setIsLoading(true);
        // TODO: Replace with actual API call to get plugin manifest
        // For now, fetch from GitHub
        const manifest = await fetchPluginManifest(
          `https://github.com/example/${pluginId}`,
        );

        // TODO: Fetch settings schema from plugin
        // This should come from settings.json in the plugin repo
        const mockSettings: PluginSettings = {
          schema: {
            type: "object",
            properties: {
              sensitivity: {
                type: "number",
                title: "Sensitivity",
                description: "Detection sensitivity level",
                default: 80,
                minimum: 0,
                maximum: 100,
              },
              checkFrequency: {
                type: "string",
                title: "Check frequency",
                description: "How often to check for follow-ups",
                default: "hourly",
                enum: ["hourly", "4hours", "daily"],
              },
              excludeSenders: {
                type: "array",
                title: "Exclude senders",
                description:
                  "Email patterns to exclude from follow-up detection",
                default: [],
                items: { type: "string" },
              },
              emailReminders: {
                type: "boolean",
                title: "Email reminders",
                description: "Send email notifications for follow-ups",
                default: true,
              },
              browserNotifications: {
                type: "boolean",
                title: "Browser notifications",
                description: "Show browser notifications",
                default: true,
              },
            },
          },
          ui: {
            sections: [
              {
                title: "General",
                fields: ["sensitivity", "checkFrequency", "excludeSenders"],
              },
              {
                title: "Notifications",
                fields: ["emailReminders", "browserNotifications"],
              },
            ],
          },
        };

        setPluginName(manifest.name);
        setSettingsSchema(mockSettings);
        // TODO: Load current settings from database
        setCurrentSettings({});
      } catch (err) {
        setError(
          err instanceof Error
            ? err
            : new Error("Failed to load plugin settings"),
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadPluginSchema();
  }, [pluginId]);

  const handleSave = async (settings: Record<string, unknown>) => {
    const result = await updatePluginSettingsAction({ pluginId, settings });

    if (result?.serverError) {
      toastError({
        title: "Failed to save settings",
        description: result.serverError,
      });
      return false;
    }

    toastSuccess({ description: "Settings saved successfully" });
    return true;
  };

  const handleBack = () => {
    router.push(`/${emailAccountId}/plugins`);
  };

  return (
    <div className="content-container">
      <div className="mb-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="mb-4">
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          Back to Plugins
        </Button>
        <PageHeader title={`${pluginName} Settings`} />
      </div>

      <LoadingContent
        loading={isLoading}
        error={error ? { error: error.message } : undefined}
      >
        {settingsSchema && (
          <DynamicSettingsForm
            schema={settingsSchema}
            currentSettings={currentSettings}
            onSave={handleSave}
          />
        )}
      </LoadingContent>
    </div>
  );
}
