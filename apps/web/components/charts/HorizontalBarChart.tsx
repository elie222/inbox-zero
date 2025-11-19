"use client";

import { cx } from "class-variance-authority";
import Image from "next/image";

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
        const domain = item.name.includes("@")
          ? item.name.split("@")[1]
          : item.name;
        const hasSubdomain = domain.split(".").length > 2;
        const apexDomain = hasSubdomain
          ? domain.split(".").slice(1).join(".")
          : domain;
        const icon = domain
          ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=http://${apexDomain}&size=64`
          : "";

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
                <div className="flex items-center gap-2">
                  <Image
                    width={20}
                    height={20}
                    src={icon}
                    alt="favicon"
                    className="rounded-full z-10"
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
