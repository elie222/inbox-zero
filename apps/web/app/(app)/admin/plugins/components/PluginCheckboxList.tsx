"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { RiskIndicator } from "@/components/plugins/RiskIndicator";
import { TrustBadge } from "@/components/plugins/TrustBadge";

interface Plugin {
  id: string;
  name: string;
  author?: string;
  trustLevel?: "verified" | "community" | "unverified";
}

interface PluginCheckboxListProps {
  plugins: Plugin[];
  selectedPlugins: string[];
  onToggle: (pluginId: string, checked: boolean) => void;
}

export function PluginCheckboxList({
  plugins,
  selectedPlugins,
  onToggle,
}: PluginCheckboxListProps) {
  return (
    <div className="space-y-3 rounded-md border p-4 max-h-80 overflow-y-auto">
      {plugins.length === 0 ? (
        <p className="text-sm text-muted-foreground">No plugins available</p>
      ) : (
        plugins.map((plugin) => {
          const isChecked = selectedPlugins.includes(plugin.id);
          return (
            <div
              key={plugin.id}
              className="flex items-start space-x-3 rounded-lg border border-border p-3"
            >
              <Checkbox
                id={`plugin-${plugin.id}`}
                checked={isChecked}
                onCheckedChange={(checked) => {
                  onToggle(plugin.id, checked === true);
                }}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{plugin.name}</span>
                  <TrustBadge level={plugin.trustLevel || "unverified"} />
                </div>
                {plugin.author && (
                  <p className="text-sm text-muted-foreground">
                    by {plugin.author}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">
                    Trust Level:
                  </span>
                  <RiskIndicator
                    level={getTrustRiskLevel(plugin.trustLevel)}
                    size="sm"
                    showLabel={false}
                  />
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function getTrustRiskLevel(
  trustLevel?: "verified" | "community" | "unverified",
): "low" | "medium" | "high" {
  switch (trustLevel) {
    case "verified":
      return "low";
    case "community":
      return "medium";
    default:
      return "high";
  }
}
