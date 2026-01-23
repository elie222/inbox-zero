"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/utils";

interface RiskIndicatorProps {
  level: "low" | "medium" | "high";
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function RiskIndicator({
  level,
  showLabel = true,
  size = "md",
}: RiskIndicatorProps) {
  const config = getRiskConfig(level);
  const sizeConfig = getSizeConfig(size);

  return (
    <div className="flex items-center gap-2">
      <config.icon
        className={cn(sizeConfig.iconSize, config.textColor)}
        aria-hidden="true"
      />
      <div className="flex flex-1 items-center gap-2">
        <div
          className={cn(
            "flex items-center gap-0.5 rounded",
            sizeConfig.barHeight,
          )}
          role="meter"
          aria-valuemin={0}
          aria-valuemax={14}
          aria-valuenow={config.filledSegments}
          aria-label={`Risk level: ${config.label}`}
        >
          {Array.from({ length: 14 }).map((_, index) => (
            <div
              key={index}
              className={cn(
                "rounded-sm transition-colors",
                sizeConfig.segmentWidth,
                sizeConfig.barHeight,
                index < config.filledSegments
                  ? config.barColor
                  : "bg-gray-200 dark:bg-gray-700",
              )}
            />
          ))}
        </div>
        {showLabel && (
          <span
            className={cn(
              "font-medium",
              config.textColor,
              sizeConfig.labelSize,
            )}
          >
            {config.label}
          </span>
        )}
      </div>
    </div>
  );
}

function getRiskConfig(level: "low" | "medium" | "high") {
  switch (level) {
    case "low":
      return {
        label: "LOW",
        filledSegments: 4,
        barColor: "bg-emerald-500",
        textColor: "text-emerald-600 dark:text-emerald-500",
        icon: CheckCircle2,
      };
    case "medium":
      return {
        label: "MEDIUM",
        filledSegments: 10,
        barColor: "bg-amber-500",
        textColor: "text-amber-600 dark:text-amber-500",
        icon: AlertTriangle,
      };
    case "high":
      return {
        label: "HIGH",
        filledSegments: 13,
        barColor: "bg-red-500",
        textColor: "text-red-600 dark:text-red-500",
        icon: XCircle,
      };
  }
}

function getSizeConfig(size: "sm" | "md" | "lg") {
  switch (size) {
    case "sm":
      return {
        iconSize: "h-4 w-4",
        segmentWidth: "w-1.5",
        barHeight: "h-2",
        labelSize: "text-xs",
      };
    case "md":
      return {
        iconSize: "h-5 w-5",
        segmentWidth: "w-2",
        barHeight: "h-3",
        labelSize: "text-sm",
      };
    case "lg":
      return {
        iconSize: "h-6 w-6",
        segmentWidth: "w-3",
        barHeight: "h-4",
        labelSize: "text-base",
      };
  }
}
