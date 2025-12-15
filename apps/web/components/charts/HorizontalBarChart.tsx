"use client";

import { DomainIcon } from "@/components/charts/DomainIcon";
import { cn } from "@/utils";
import { extractDomainFromEmail } from "@/utils/email";

interface HorizontalBarChartProps {
  data: Array<{
    name: string;
    value: number;
    href?: string;
    target?: string;
  }>;
  className?: string;
}

export function HorizontalBarChart({
  data,
  className,
}: HorizontalBarChartProps) {
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <div className={cn("space-y-2", className)}>
      {data.map((item) => {
        const widthPercentage = (item.value / maxValue) * 100;
        const domain = extractDomainFromEmail(item.name) || item.name;

        return (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="px-3 py-2 relative">
                <div
                  className="absolute top-0 left-0 bg-gradient-to-r h-full rounded-md from-blue-100 to-blue-50 dark:from-blue-500 dark:to-blue-500/80"
                  style={{ width: `${widthPercentage}%` }}
                />
                <div className="flex items-center gap-2">
                  <DomainIcon domain={domain} />
                  {item.href ? (
                    <a
                      href={item.href}
                      target={item.target}
                      rel={
                        item.target === "_blank"
                          ? "noopener noreferrer"
                          : undefined
                      }
                      className="text-sm text-gray-900 dark:text-gray-100 truncate block z-10 relative hover:underline"
                    >
                      {item.name}
                    </a>
                  ) : (
                    <span className="text-sm text-gray-900 truncate block z-10 relative">
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
          </div>
        );
      })}
    </div>
  );
}
