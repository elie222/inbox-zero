"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import useSWR from "swr";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/Input";
import { PluginCheckboxList } from "./PluginCheckboxList";
import { updatePluginAllowlistAction } from "@/utils/actions/admin-plugins";
import {
  updatePluginAllowlistBody,
  type UpdatePluginAllowlistBody,
} from "@/utils/actions/admin-plugins.validation";
import { toastSuccess, toastError } from "@/components/Toast";
import { LoadingContent } from "@/components/LoadingContent";
import type { PluginCatalogResponse } from "@/app/api/plugins/catalog/route";

interface AllowlistSettingsProps {
  initialMode: "all" | "selected";
  initialAllowedPlugins: string[];
}

export function AllowlistSettings({
  initialMode,
  initialAllowedPlugins,
}: AllowlistSettingsProps) {
  const [mode, setMode] = useState<"all" | "selected">(initialMode);
  const [selectedPlugins, setSelectedPlugins] = useState<string[]>(
    initialAllowedPlugins,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const {
    data: catalogData,
    isLoading,
    error,
  } = useSWR<PluginCatalogResponse>("/api/plugins/catalog");

  const {
    handleSubmit,
    formState: { isDirty },
    setValue,
  } = useForm<UpdatePluginAllowlistBody>({
    resolver: zodResolver(updatePluginAllowlistBody),
    defaultValues: {
      mode: initialMode,
      allowedPlugins: initialAllowedPlugins,
    },
  });

  const filteredPlugins = useMemo(() => {
    if (!searchQuery.trim()) return catalogData?.plugins || [];
    const query = searchQuery.toLowerCase();
    return (catalogData?.plugins || []).filter(
      (plugin) =>
        plugin.name.toLowerCase().includes(query) ||
        plugin.author?.toLowerCase().includes(query),
    );
  }, [catalogData?.plugins, searchQuery]);

  // sync form with local state
  useEffect(() => {
    setValue("mode", mode, { shouldDirty: true });
    setValue("allowedPlugins", selectedPlugins, { shouldDirty: true });
  }, [mode, selectedPlugins, setValue]);

  const handleTogglePlugin = useCallback(
    (pluginId: string, checked: boolean) => {
      setSelectedPlugins((prev) => {
        if (checked) {
          return [...prev, pluginId];
        }
        return prev.filter((id) => id !== pluginId);
      });
    },
    [],
  );

  const handleSelectAll = useCallback(() => {
    const visibleIds = filteredPlugins.map((p) => p.id);
    setSelectedPlugins((prev) => [...new Set([...prev, ...visibleIds])]);
  }, [filteredPlugins]);

  const handleClearAll = useCallback(() => {
    const visibleIds = new Set(filteredPlugins.map((p) => p.id));
    setSelectedPlugins((prev) => prev.filter((id) => !visibleIds.has(id)));
  }, [filteredPlugins]);

  const onSubmit = useCallback(async (data: UpdatePluginAllowlistBody) => {
    setIsSaving(true);
    try {
      const result = await updatePluginAllowlistAction(data);
      if (result?.serverError) {
        toastError({
          title: "Failed to save settings",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Plugin allowlist updated successfully" });
      }
    } catch {
      toastError({
        title: "Failed to save settings",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsSaving(false);
    }
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold mb-2">Plugin Access Control</h2>
        <p className="text-sm text-muted-foreground">
          Control which plugins users can install and use in your organization.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="space-y-3">
          <Label className="text-base font-medium">Allow plugins:</Label>
          <RadioGroup
            value={mode}
            onValueChange={(value) => setMode(value as "all" | "selected")}
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="all" id="mode-all" className="mt-0.5" />
              <div className="space-y-1">
                <Label
                  htmlFor="mode-all"
                  className="cursor-pointer font-medium"
                >
                  All plugins
                </Label>
                <p className="text-sm text-muted-foreground">
                  Users can install any plugin from the catalog
                </p>
              </div>
            </div>
            <div className="flex items-start space-x-3">
              <RadioGroupItem
                value="selected"
                id="mode-selected"
                className="mt-0.5"
              />
              <div className="space-y-1">
                <Label
                  htmlFor="mode-selected"
                  className="cursor-pointer font-medium"
                >
                  Selected only
                </Label>
                <p className="text-sm text-muted-foreground">
                  Users can only install approved plugins from the list below
                </p>
              </div>
            </div>
          </RadioGroup>
        </div>

        {mode === "selected" && (
          <div className="space-y-3">
            <Label className="text-base font-medium">Approved Plugins</Label>
            <LoadingContent loading={isLoading} error={error}>
              <div className="space-y-3">
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

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleSelectAll}
                    >
                      Select All
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleClearAll}
                    >
                      Clear All
                    </Button>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {selectedPlugins.length} of{" "}
                    {catalogData?.plugins?.length || 0} plugins selected
                  </span>
                </div>

                <PluginCheckboxList
                  plugins={filteredPlugins}
                  selectedPlugins={selectedPlugins}
                  onToggle={handleTogglePlugin}
                />
              </div>
            </LoadingContent>
          </div>
        )}

        <div className="flex justify-end">
          <Button type="submit" loading={isSaving} disabled={!isDirty}>
            Save
          </Button>
        </div>
      </form>
    </div>
  );
}
