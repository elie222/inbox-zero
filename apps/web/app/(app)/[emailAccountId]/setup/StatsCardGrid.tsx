"use client";

import type { LucideIcon } from "lucide-react";
import { InfoIcon, MailIcon, PenIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatStat } from "@/utils/stats";

const variants = {
  blue: {
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  green: {
    iconBg: "bg-green-100 dark:bg-green-900/50",
    iconColor: "text-green-600 dark:text-green-400",
  },
  orange: {
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  purple: {
    iconBg: "bg-purple-100 dark:bg-purple-900/50",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  red: {
    iconBg: "bg-red-100 dark:bg-red-900/50",
    iconColor: "text-red-600 dark:text-red-400",
  },
  yellow: {
    iconBg: "bg-yellow-100 dark:bg-yellow-900/50",
    iconColor: "text-yellow-600 dark:text-yellow-400",
  },
} as const;

export type StatVariant = keyof typeof variants;

export type StatItem = {
  icon: LucideIcon;
  value: string | number;
  title: string;
  tooltip?: string;
  variant?: StatVariant;
  iconBg?: string;
  iconColor?: string;
};

export function StatsCardGrid() {
  const emailsProcessed = 0;
  const draftedEmails = 0;

  const items: StatItem[] = [
    {
      icon: MailIcon,
      variant: "blue",
      value: formatStat(emailsProcessed),
      title: "Emails processed",
      tooltip: "Total emails that have been processed so far.",
    },
    {
      icon: PenIcon,
      variant: "green",
      value: formatStat(draftedEmails),
      title: "Drafted emails",
      tooltip: "Total AI-drafted email replies created so far.",
    },
  ];

  return (
    <Card className="mb-6">
      <div className="flex flex-col divide-y divide-border sm:flex-row sm:divide-x sm:divide-y-0">
        {items.map((item, index) => {
          const Icon = item.icon;
          const variant = item.variant
            ? variants[item.variant]
            : {
                iconBg: item.iconBg || "",
                iconColor: item.iconColor || "",
              };

          return (
            <div key={index} className="flex-1 p-6">
              <div
                className={`size-10 mb-4 flex items-center justify-center rounded-lg ${variant.iconBg}`}
              >
                <Icon className={`size-5 ${variant.iconColor}`} />
              </div>
              <div className="mb-1 text-2xl font-bold">{item.value}</div>
              <div className="mb-1 flex items-center gap-1.5">
                <h3 className="text-base text-gray-600">{item.title}</h3>
                {item.tooltip && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 cursor-pointer text-gray-400 hover:text-gray-500" />
                    </TooltipTrigger>
                    <TooltipContent>{item.tooltip}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
