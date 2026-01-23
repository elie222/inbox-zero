"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TabsToolbar } from "@/components/TabsToolbar";
import { PluginCard } from "@/components/plugins/PluginCard";
import { UpdatesBadge } from "@/components/plugins/UpdatesBadge";
import { UpdateNotification } from "./components/UpdateNotification";
import { UpdateModal } from "./components/UpdateModal";
import { toastError, toastSuccess } from "@/components/Toast";
import { SearchIcon, PlusIcon } from "lucide-react";
import { updateAllPluginsAction } from "@/utils/actions/plugins";
import { usePluginUpdates } from "@/hooks/usePluginUpdates";
import type { PluginCatalogResponse } from "@/app/api/plugins/catalog/route";
import type { InstalledPluginsResponse } from "@/app/api/plugins/installed/route";

const PLUGIN_CATEGORIES = [
  { value: "all", label: "All" },
  { value: "automation", label: "Automation" },
  { value: "drafting", label: "Drafting" },
  { value: "calendar", label: "Calendar" },
  { value: "productivity", label: "Productivity" },
  { value: "analytics", label: "Analytics" },
] as const;

export default function PluginsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [isUpdatingAll, setIsUpdatingAll] = useState(false);

  const {
    data: catalogData,
    isLoading: catalogLoading,
    error: catalogError,
    mutate: mutateCatalog,
  } = useSWR<PluginCatalogResponse>("/api/plugins/catalog");
  const { data: installedData, mutate: mutateInstalled } =
    useSWR<InstalledPluginsResponse>("/api/plugins/installed");
  const { updates, updateCount, mutate: mutateUpdates } = usePluginUpdates();

  const installedPluginIds = useMemo(() => {
    return new Set(installedData?.plugins.map((p) => p.id) || []);
  }, [installedData]);

  const filterPlugins = (
    plugins: PluginCatalogResponse["plugins"],
    _category: string,
  ) => {
    let filtered = plugins || [];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((plugin) => {
        const matchesName = plugin.name.toLowerCase().includes(query);
        const matchesDescription = plugin.description
          ?.toLowerCase()
          .includes(query);
        const matchesId = plugin.id.toLowerCase().includes(query);
        return matchesName || matchesDescription || matchesId;
      });
    }

    return filtered;
  };

  const handleUpdateAll = useCallback(async () => {
    setIsUpdatingAll(true);
    try {
      const result = await updateAllPluginsAction();
      if (result?.serverError) {
        toastError({ title: "Update failed", description: result.serverError });
      } else {
        const successful =
          result?.data?.results.filter((r) => r.success).length || 0;
        const failed =
          result?.data?.results.filter((r) => !r.success).length || 0;

        if (failed > 0) {
          toastError({
            title: "Some updates failed",
            description: `${successful} updated, ${failed} failed`,
          });
        } else {
          toastSuccess({
            description: `${successful} plugin${successful > 1 ? "s" : ""} updated successfully`,
          });
        }

        mutateInstalled();
        mutateCatalog();
        mutateUpdates();
      }
    } catch {
      toastError({
        title: "Update failed",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsUpdatingAll(false);
    }
  }, [mutateInstalled, mutateCatalog, mutateUpdates]);

  const handlePluginUpdate = useCallback(() => {
    mutateInstalled();
    mutateCatalog();
    mutateUpdates();
  }, [mutateInstalled, mutateCatalog, mutateUpdates]);

  return (
    <div>
      <div className="content-container mb-4">
        <div className="flex items-center justify-between">
          <PageHeader title="Plugin Library" />
          <div className="flex items-center gap-2">
            {updateCount > 0 && <UpdatesBadge count={updateCount} />}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("./plugins/install")}
            >
              <PlusIcon className="mr-2 h-4 w-4" />
              Install from URL
            </Button>
          </div>
        </div>
      </div>

      <div className="content-container">
        <UpdateNotification
          count={updateCount}
          onViewUpdates={() => setUpdateModalOpen(true)}
          onUpdateAll={handleUpdateAll}
          isUpdating={isUpdatingAll}
        />
      </div>

      <UpdateModal
        open={updateModalOpen}
        onOpenChange={setUpdateModalOpen}
        updates={updates}
        onUpdate={handlePluginUpdate}
      />

      <Tabs defaultValue="all">
        <TabsToolbar>
          <div className="w-full overflow-x-auto">
            <TabsList>
              {PLUGIN_CATEGORIES.map((category) => (
                <TabsTrigger key={category.value} value={category.value}>
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </TabsToolbar>

        <div className="content-container my-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              name="search"
              placeholder="Search plugins..."
              className="pl-9"
              registerProps={{
                value: searchQuery,
                onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                  setSearchQuery(e.target.value),
              }}
            />
          </div>
        </div>

        <LoadingContent loading={catalogLoading} error={catalogError}>
          {PLUGIN_CATEGORIES.map((category) => (
            <TabsContent
              key={category.value}
              value={category.value}
              className="content-container mb-10"
            >
              <PluginGrid
                plugins={filterPlugins(
                  catalogData?.plugins || [],
                  category.value,
                )}
                installedPluginIds={installedPluginIds}
                installedPlugins={installedData?.plugins || []}
                onPluginUpdate={handlePluginUpdate}
              />
            </TabsContent>
          ))}
        </LoadingContent>
      </Tabs>
    </div>
  );
}

function PluginGrid({
  plugins,
  installedPluginIds,
  installedPlugins,
  onPluginUpdate,
}: {
  plugins: PluginCatalogResponse["plugins"];
  installedPluginIds: Set<string>;
  installedPlugins: InstalledPluginsResponse["plugins"];
  onPluginUpdate: () => void;
}) {
  if (plugins.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No plugins found matching your criteria.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {plugins.map((plugin) => {
        const installedPlugin = installedPlugins.find(
          (p) => p.id === plugin.id,
        );
        const isInstalled = installedPluginIds.has(plugin.id);
        const hasUpdate =
          isInstalled &&
          installedPlugin &&
          installedPlugin.version !== plugin.version;

        return (
          <PluginCard
            key={plugin.id}
            plugin={plugin}
            isInstalled={isInstalled}
            installedVersion={installedPlugin?.version}
            isEnabled={installedPlugin?.enabled || false}
            hasUpdate={hasUpdate}
            onUpdate={onPluginUpdate}
          />
        );
      })}
    </div>
  );
}
