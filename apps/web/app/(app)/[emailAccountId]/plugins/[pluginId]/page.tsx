"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import { PluginPermissionBadge } from "@/components/plugins/PluginPermissionBadge";
import { InstallModal } from "../components/InstallModal";
import { PermissionList } from "../components/PermissionList";
import { formatPermissionSummary } from "@/lib/plugin-runtime/risk-levels";
import { ArrowLeft, Download, CheckCircle2, ExternalLink } from "lucide-react";
import type { PluginCatalogResponse } from "@/app/api/plugins/catalog/route";
import type { InstalledPluginsResponse } from "@/app/api/plugins/installed/route";

export default function PluginDetailPage() {
  const params = useParams();
  const router = useRouter();
  const pluginId = params.pluginId as string;
  const emailAccountId = params.emailAccountId as string;

  const [installModalOpen, setInstallModalOpen] = useState(false);

  const {
    data: catalogData,
    isLoading: catalogLoading,
    error: catalogError,
  } = useSWR<PluginCatalogResponse>("/api/plugins/catalog");
  const { data: installedData, mutate: mutateInstalled } =
    useSWR<InstalledPluginsResponse>("/api/plugins/installed");

  const plugin = useMemo(() => {
    return catalogData?.plugins.find((p) => p.id === pluginId);
  }, [catalogData, pluginId]);

  const installedPlugin = useMemo(() => {
    return installedData?.plugins.find((p) => p.id === pluginId);
  }, [installedData, pluginId]);

  const isInstalled = !!installedPlugin;

  const permissionSummary = useMemo(() => {
    return plugin ? formatPermissionSummary(plugin) : null;
  }, [plugin]);

  const handleBack = () => {
    router.push(`/${emailAccountId}/plugins`);
  };

  const handleInstallSuccess = () => {
    mutateInstalled();
  };

  return (
    <div>
      <div className="content-container">
        <Button variant="ghost" onClick={handleBack} className="mb-4 -ml-2">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Plugin Library
        </Button>

        <LoadingContent loading={catalogLoading} error={catalogError}>
          {!plugin ? (
            <div className="py-12 text-center">
              <div className="text-muted-foreground mb-4">Plugin not found</div>
              <Button onClick={handleBack}>Return to Plugin Library</Button>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-border bg-card p-6 shadow-sm mb-6">
                <div className="flex items-start justify-between gap-6 mb-4">
                  <div className="flex-1">
                    <PageHeader title={plugin.name} />
                    {plugin.author && (
                      <div className="text-muted-foreground mt-1">
                        by {plugin.author}
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <Badge color="gray">v{plugin.version}</Badge>
                      {plugin.trustLevel && (
                        <TrustBadge level={plugin.trustLevel} />
                      )}
                      {permissionSummary && (
                        <PluginPermissionBadge
                          dangerLevel={permissionSummary.dangerLevel}
                        />
                      )}
                      {isInstalled && (
                        <Badge color="green">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          Installed
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!isInstalled && (
                      <Button
                        onClick={() => setInstallModalOpen(true)}
                        Icon={Download}
                      >
                        Install
                      </Button>
                    )}
                    {plugin.repositoryUrl && (
                      <Button
                        variant="outline"
                        onClick={() =>
                          window.open(plugin.repositoryUrl, "_blank")
                        }
                        Icon={ExternalLink}
                      >
                        View Source
                      </Button>
                    )}
                  </div>
                </div>

                {plugin.description && (
                  <div className="text-muted-foreground">
                    {plugin.description}
                  </div>
                )}
              </div>

              <div className="space-y-6">
                <section className="rounded-lg border border-border bg-card p-6">
                  <h2 className="text-lg font-semibold mb-4">Overview</h2>
                  <div className="prose prose-sm max-w-none">
                    <p className="text-muted-foreground">
                      {plugin.description ||
                        "No description available for this plugin."}
                    </p>
                  </div>
                </section>

                <section className="rounded-lg border border-border bg-card p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Permissions</h2>
                    {permissionSummary && (
                      <PluginPermissionBadge
                        dangerLevel={permissionSummary.dangerLevel}
                      />
                    )}
                  </div>

                  {permissionSummary ? (
                    <>
                      <div className="mb-4 text-sm text-muted-foreground">
                        This plugin requires the following permissions to
                        function:
                      </div>
                      <PermissionList
                        permissions={permissionSummary.capabilities}
                      />
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">
                      No permissions required
                    </div>
                  )}
                </section>

                <section className="rounded-lg border border-border bg-card p-6">
                  <h2 className="text-lg font-semibold mb-4">
                    Plugin Information
                  </h2>
                  <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        Plugin ID
                      </dt>
                      <dd className="mt-1 text-sm font-mono text-foreground">
                        {plugin.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        Version
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {plugin.version}
                      </dd>
                    </div>
                    {plugin.author && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          Author
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {plugin.author}
                        </dd>
                      </div>
                    )}
                    {plugin.license && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          License
                        </dt>
                        <dd className="mt-1 text-sm text-foreground">
                          {plugin.license}
                        </dd>
                      </div>
                    )}
                    {plugin.trustLevel && (
                      <div>
                        <dt className="text-sm font-medium text-muted-foreground">
                          Trust Level
                        </dt>
                        <dd className="mt-1">
                          <TrustBadge level={plugin.trustLevel} />
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="text-sm font-medium text-muted-foreground">
                        Min Inbox Zero Version
                      </dt>
                      <dd className="mt-1 text-sm text-foreground">
                        {plugin.inboxZero.minVersion}
                      </dd>
                    </div>
                  </dl>
                </section>
              </div>

              {plugin && (
                <InstallModal
                  plugin={plugin}
                  open={installModalOpen}
                  onOpenChange={setInstallModalOpen}
                  onInstallSuccess={handleInstallSuccess}
                />
              )}
            </>
          )}
        </LoadingContent>
      </div>
    </div>
  );
}
