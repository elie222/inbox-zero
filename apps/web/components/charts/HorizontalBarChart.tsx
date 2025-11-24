"use client";

import { DomainIcon } from "@/components/charts/DomainIcon";
import { cn } from "@/utils";

export interface HorizontalBarChartItem {
  name: string;
  value: number;
  href?: string;
  target?: string;
  icon?: string;
}

interface HorizontalBarChartProps {
  data: Array<HorizontalBarChartItem>;
  className?: string;
  onItemClick?: (item: HorizontalBarChartItem) => void;
  hideIcon?: boolean;
}

export function HorizontalBarChart({
  data,
  className,
  onItemClick,
  hideIcon,
}: HorizontalBarChartProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className={cn("space-y-2", className)}>
      {data.map((item) => {
        const widthPercentage = (item.value / maxValue) * 100;
        const domain = item.name.includes("@")
          ? item.name.split("@")[1]
          : item.name;

        const content = (
          <>
            <div className="flex-1 min-w-0">
              <div className="px-3 py-2 relative">
                <div
                  className="absolute top-0 left-0 bg-gradient-to-r from-blue-100 to-blue-50 h-full rounded-md"
                  style={{ width: `${widthPercentage}%` }}
                />
                <div className="flex items-center gap-2 relative z-10">
                  {!hideIcon &&
                    (item.icon ? (
                      <span className="text-base">{item.icon}</span>
                    ) : (
                      <DomainIcon domain={domain} />
                    ))}
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.target}
                      className="text-sm text-gray-900 truncate block z-10 relative hover:underline"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <span
                      className={cn(
                        "text-sm text-gray-900 truncate block z-10 relative",
                        onItemClick && "group-hover:underline",
                      )}
                    >
                      {item.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex-shrink-0">
              <span className="text-sm text-gray-600">
                {item.value.toLocaleString()}
              </span>
            </div>
          </>
        );

        if (onItemClick) {
          return (
            <button
              key={item.name}
              type="button"
              className="w-full flex items-center justify-between gap-4 group"
              onClick={() => onItemClick(item)}
            >
              {content}
            </button>
          );
        }

        return (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
