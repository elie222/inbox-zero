"use client";

import { cx } from "class-variance-authority";
import Image from "next/image";
import { useState } from "react";

function FallbackIcon({ seed }: { seed: string }) {
  const hash = seed.split("").reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0);

  const gradients = [
    "from-blue-300 to-blue-700",
    "from-purple-300 to-purple-700",
    "from-green-300 to-green-700",
    "from-emerald-300 to-emerald-700",
    "from-yellow-300 to-yellow-700",
    "from-orange-300 to-orange-700",
    "from-red-300 to-red-700",
    "from-indigo-300 to-indigo-700",
    "from-pink-300 to-pink-700",
    "from-fuchsia-300 to-fuchsia-700",
    "from-rose-300 to-rose-700",
    "from-sky-300 to-sky-700",
    "from-teal-300 to-teal-700",
    "from-violet-300 to-violet-700",
  ];

  const gradientIndex = hash % gradients.length;

  return (
    <div
      className={cx(
        "rounded-full size-5 z-10 bg-gradient-to-r",
        gradients[gradientIndex],
      )}
    />
  );
}

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
  const [fallbackEnabled, setFallbackEnabled] = useState<
    Record<string, boolean>
  >({});

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
        const domainFavicon = domain
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
                  {fallbackEnabled[item.name] ? (
                    <FallbackIcon seed={item.name} />
                  ) : (
                    <Image
                      width={20}
                      height={20}
                      src={domainFavicon}
                      alt="favicon"
                      className="rounded-full z-10"
                      onError={() =>
                        setFallbackEnabled({
                          ...fallbackEnabled,
                          [item.name]: true,
                        })
                      }
                    />
                  )}
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
