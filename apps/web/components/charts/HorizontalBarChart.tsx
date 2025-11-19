"use client";

import { cx } from "class-variance-authority";

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
    <div className={cx("space-y-2", className)}>
      {data.map((item) => {
        const widthPercentage = (item.value / maxValue) * 100;

        return (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4"
          >
            <div className="flex-1 min-w-0">
              <div className="px-3 py-2 relative">
                <div
                  className="absolute top-0 left-0 bg-gradient-to-r from-blue-100 to-blue-50 h-full rounded-md"
                  style={{ width: `${widthPercentage}%` }}
                />
                <a
                  href={item.href}
                  target={item.target}
                  className="text-sm text-gray-900 truncate block z-10 relative hover:underline"
                >
                  {item.name}
                </a>
              </div>
            </div>
            <div className="flex-shrink-0">
              <span className="text-sm text-gray-500">
                {item.value.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
