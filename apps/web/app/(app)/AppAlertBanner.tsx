import { AlertCircleIcon } from "lucide-react";
import type React from "react";
import { cn } from "@/utils";

export function AppAlertBanner({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "relative z-10 flex w-full flex-col gap-4 border-red-200 border-y bg-red-50 px-4 py-4 text-red-950 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:border-red-900 dark:bg-red-950 dark:text-red-50",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        <AlertCircleIcon className="mt-0.5 size-5 shrink-0 text-red-600 dark:text-red-400" />
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          <div className="mt-1 text-sm text-red-800 dark:text-red-200">
            {description}
          </div>
        </div>
      </div>
      {action ? <div className="shrink-0 pl-8 sm:pl-0">{action}</div> : null}
    </div>
  );
}
