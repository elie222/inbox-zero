"use client";

import { useState, useMemo } from "react";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { SearchIcon, PackageIcon } from "lucide-react";
import Link from "next/link";
import { InstalledPluginCard } from "../components/InstalledPluginCard";
import { UpdatesBadge } from "@/components/plugins/UpdatesBadge";
import { updateAllPluginsAction } from "@/utils/actions/plugins";
import { toastSuccess, toastError } from "@/components/Toast";
import type { InstalledPluginsResponse } from "@/app/api/plugins/installed/route";
import type { PluginCatalogResponse } from "@/app/api/plugins/catalog/route";

export default function InstalledPluginsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  const {
    data: installedData,
    isLoading,
    error,
    mutate,
  } = useSWR<InstalledPluginsResponse>("/api/plugins/installed");
  const { data: catalogData } = useSWR<PluginCatalogResponse>(
    "/api/plugins/catalog",
  );

  const updatesAvailable = useMemo(() => {
    if (!catalogData?.plugins || !installedData?.plugins) return 0;

    let count = 0;
    for (const installed of installedData.plugins) {
      const catalog = catalogData.plugins.find((p) => p.id === installed.id);
      if (catalog && catalog.version !== installed.version) {
        count++;
      }
    }
    return count;
  }, [catalogData, installedData]);

  const filteredPlugins = useMemo(() => {
    if (!installedData?.plugins) return [];

    let filtered = installedData.plugins;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((plugin) => {
        const catalogPlugin = catalogData?.plugins.find(
          (p) => p.id === plugin.id,
        );
        const matchesId = plugin.id.toLowerCase().includes(query);
        const matchesName = catalogPlugin?.name.toLowerCase().includes(query);
        return matchesId || matchesName;
      });
    }

    return filtered;
  }, [installedData, catalogData, searchQuery]);

  const handleUpdateAll = async () => {
    setIsUpdatingAll(true);
    try {
      const result = await updateAllPluginsAction();
      if (result?.serverError) {
        toastError({
          title: "Failed to update plugins",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "All plugins updated successfully" });
        mutate();
      }
    } catch {
      toastError({
        title: "Failed to update plugins",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsUpdatingAll(false);
    }
  };

  return (
    <div>
      <div className="content-container mb-4">
        <div className="flex items-center justify-between">
          <PageHeader title="Installed Plugins" />
          <Button variant="outline" size="sm" asChild>
            <Link href="/plugins">Browse Store</Link>
          </Button>
        </div>
      </div>

      <div className="content-container mb-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            name="search"
            placeholder="Search installed plugins..."
            className="pl-9"
            registerProps={{
              value: searchQuery,
              onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                setSearchQuery(e.target.value),
            }}
          />
        </div>
      </div>

      {updatesAvailable > 0 && (
        <div className="content-container mb-4">
          <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
            <div className="flex items-center gap-2">
              <UpdatesBadge count={updatesAvailable} />
              <span className="text-sm text-muted-foreground">
                {updatesAvailable}{" "}
                {updatesAvailable === 1 ? "update" : "updates"} available
              </span>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={handleUpdateAll}
              loading={isUpdatingAll}
            >
              Update All
            </Button>
          </div>
        </div>
      )}

      <LoadingContent loading={isLoading} error={error}>
        {filteredPlugins.length === 0 ? (
          <div className="content-container py-12">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 rounded-full bg-muted p-4">
                <PackageIcon className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mb-2 font-semibold">No plugins installed</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                Enhance your Inbox Zero experience with plugins from trusted
                developers.
              </p>
              <Button variant="default" size="sm" asChild>
                <Link href="/plugins">Browse Plugin Library</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="content-container mb-10">
            <div className="mb-4 text-sm text-muted-foreground">
              {filteredPlugins.length}{" "}
              {filteredPlugins.length === 1 ? "plugin" : "plugins"} installed
            </div>
            <div className="space-y-4">
              {filteredPlugins.map((plugin) => {
                const catalogPlugin = catalogData?.plugins.find(
                  (p) => p.id === plugin.id,
                );
                const hasUpdate = Boolean(
                  catalogPlugin && catalogPlugin.version !== plugin.version,
                );

                return (
                  <InstalledPluginCard
                    key={plugin.id}
                    plugin={plugin}
                    catalogPlugin={catalogPlugin}
                    hasUpdate={hasUpdate}
                    onUpdate={mutate}
                  />
                );
              })}
            </div>
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
