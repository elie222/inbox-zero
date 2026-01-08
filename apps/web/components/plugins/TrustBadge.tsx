"use client";

import { Badge } from "@/components/Badge";
import { BadgeCheck, Users, AlertTriangle } from "lucide-react";

interface TrustBadgeProps {
  level: "verified" | "community" | "unverified";
}

export function TrustBadge({ level }: TrustBadgeProps) {
  const config = getTrustConfig(level);

  return (
    <Badge color={config.color} className="flex items-center gap-1">
      <config.icon className="h-3 w-3" />
      <span>{config.label}</span>
    </Badge>
  );
}

function getTrustConfig(level: "verified" | "community" | "unverified") {
  switch (level) {
    case "verified":
      return {
        label: "Verified",
        color: "green" as const,
        icon: BadgeCheck,
      };
    case "community":
      return {
        label: "Community",
        color: "blue" as const,
        icon: Users,
      };
    case "unverified":
      return {
        label: "Unverified",
        color: "gray" as const,
        icon: AlertTriangle,
      };
  }
}
