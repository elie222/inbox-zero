"use client";

import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import type { CapabilityRisk } from "@/lib/plugin-runtime/risk-levels";
import { RiskIndicator } from "@/components/plugins/RiskIndicator";

interface Permission {
  name: string;
  description: string;
  risk: CapabilityRisk;
  whyNeeded?: string;
}

interface PermissionListProps {
  permissions: Permission[];
  variant?: "default" | "compact";
}

export function PermissionList({
  permissions,
  variant = "default",
}: PermissionListProps) {
  if (permissions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground">
        No special permissions required
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {permissions.map((permission, index) => (
        <PermissionItem
          key={`${permission.name}-${index}`}
          permission={permission}
          variant={variant}
        />
      ))}
    </div>
  );
}

interface PermissionItemProps {
  permission: Permission;
  variant: "default" | "compact";
}

function PermissionItem({ permission, variant }: PermissionItemProps) {
  const config = getRiskConfig(permission.risk);

  if (variant === "compact") {
    return (
      <div className="flex items-start gap-2">
        <config.icon
          className={`mt-0.5 h-4 w-4 flex-shrink-0 ${config.iconColor}`}
        />
        <div className="flex-1 text-sm">
          <span className="font-medium text-foreground">
            {permission.description}
          </span>
        </div>
      </div>
    );
  }

  const riskLevel = permission.risk === "elevated" ? "medium" : "low";

  return (
    <div
      className={`rounded-lg border p-3 ${config.borderColor} ${config.bgColor}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <config.icon
            className={`mt-0.5 h-5 w-5 flex-shrink-0 ${config.iconColor}`}
          />
          <div className="flex-1">
            <div className="font-medium text-foreground">
              {permission.description}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Capability: {permission.name}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Risk:</span>
              <RiskIndicator level={riskLevel} size="sm" showLabel={false} />
              <span className="text-xs capitalize">
                {riskLevel === "medium" ? "Medium" : "Low"}
              </span>
            </div>

            {permission.whyNeeded && (
              <p className="mt-1 text-xs text-muted-foreground">
                Why needed: {permission.whyNeeded}
              </p>
            )}
          </div>
        </div>
        <div
          className={`text-xs font-medium px-2 py-1 rounded ${config.labelBg} ${config.labelText}`}
        >
          {config.label}
        </div>
      </div>
    </div>
  );
}

function getRiskConfig(risk: CapabilityRisk) {
  switch (risk) {
    case "standard":
      return {
        label: "Standard",
        icon: CheckCircle2,
        iconColor: "text-green-600",
        labelBg: "bg-green-100",
        labelText: "text-green-700",
        borderColor: "border-green-200",
        bgColor: "bg-green-50/50",
      };
    case "elevated":
      return {
        label: "Elevated",
        icon: AlertTriangle,
        iconColor: "text-amber-600",
        labelBg: "bg-amber-100",
        labelText: "text-amber-700",
        borderColor: "border-amber-200",
        bgColor: "bg-amber-50/50",
      };
    default:
      return {
        label: "Unknown",
        icon: AlertCircle,
        iconColor: "text-red-600",
        labelBg: "bg-red-100",
        labelText: "text-red-700",
        borderColor: "border-red-200",
        bgColor: "bg-red-50/50",
      };
  }
}
