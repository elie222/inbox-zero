"use client";

import { Badge } from "@/components/Badge";
import type { DangerLevel } from "@/lib/plugin-runtime/risk-levels";
import { Shield, ShieldCheck } from "lucide-react";

interface PluginPermissionBadgeProps {
  dangerLevel: DangerLevel;
}

export function PluginPermissionBadge({
  dangerLevel,
}: PluginPermissionBadgeProps) {
  const config = getBadgeConfig(dangerLevel);

  return (
    <Badge color={config.color} className="flex items-center gap-1">
      <config.icon className="h-3 w-3" />
      <span>{config.label}</span>
    </Badge>
  );
}

function getBadgeConfig(dangerLevel: DangerLevel) {
  switch (dangerLevel) {
    case "standard":
      return {
        label: "Standard",
        color: "green" as const,
        icon: ShieldCheck,
      };
    case "elevated":
      return {
        label: "Extra Permissions",
        color: "yellow" as const,
        icon: Shield,
      };
  }
}
