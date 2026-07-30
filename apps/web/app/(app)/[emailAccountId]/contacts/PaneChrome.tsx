"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/utils";

// The detail drawer's shared frame: a mark, a serif title, a stats row, and a
// tab strip, with the body scrolling beneath. Both the contact pane and the
// company pane render through this so they stay visually identical.
export function PaneShell({
  mark,
  title,
  subtitle,
  actions,
  stats,
  lastInteractionAt,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  mark: ReactNode;
  title: string;
  subtitle: string;
  actions?: ReactNode;
  // Three headline numbers — "12 emails / 8 received / 4 sent" and the like
  stats: { value: number; label: string }[];
  lastInteractionAt: Date | null;
  tabs: { key: string; label: string }[];
  activeTab: string;
  onTabChange: (key: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-1 pt-1">
        {/* pr-8 clears the sheet's absolutely-positioned close button */}
        <div className="flex items-start gap-3.5 pr-8">
          {mark}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-2xl tracking-tight">
              {title}
            </h2>
            <p className="truncate text-[13px] text-muted-foreground">
              {subtitle}
            </p>
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1 pb-3.5">
          {stats.map((stat) => (
            <div key={stat.label}>
              <span className="text-lg font-semibold tabular-nums">
                {stat.value}
              </span>{" "}
              <span className="text-xs text-muted-foreground">
                {stat.label}
              </span>
            </div>
          ))}
          {lastInteractionAt && (
            <div className="ml-auto">
              <span className="text-xs text-muted-foreground">
                last activity
              </span>{" "}
              <span className="text-[13px] font-medium">
                {formatDistanceToNow(lastInteractionAt, { addSuffix: true })}
              </span>
            </div>
          )}
        </div>

        <div className="flex gap-5 overflow-x-auto border-b border-border text-[13.5px] font-medium">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={cn(
                "whitespace-nowrap border-b-2 px-0.5 py-2",
                tab.key === activeTab
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
              onClick={() => onTabChange(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-1 pb-6 pt-4">
        {children}
      </div>
    </div>
  );
}

// A bordered block, the drawer's one content primitive
export function PaneCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-card p-3.5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// The drawer's one heading style — an icon is optional
export function PaneSectionTitle({
  icon,
  className,
  children,
}: {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <h3
      className={cn(
        "flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80",
        className,
      )}
    >
      {icon}
      {children}
    </h3>
  );
}

// "Latest thread · subject" with a link into Mail — the drawer's one
// consistent jumping-off point back to the inbox
export function LatestThreadCard({
  subject,
  date,
  href,
}: {
  subject: string | null;
  date: Date | null;
  href: string;
}) {
  return (
    <PaneCard className="flex items-center justify-between gap-3 px-3.5 py-3">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">Latest thread</div>
        <div className="truncate text-[12.5px] text-muted-foreground">
          {subject
            ? [subject, date && formatDistanceToNow(date, { addSuffix: true })]
                .filter(Boolean)
                .join(" · ")
            : "—"}
        </div>
      </div>
      <Link
        href={href}
        // Finger-sized hit area for the pane's jump into mail history; the
        // negative margins keep the visual footprint unchanged
        className="-my-3 -mr-3 shrink-0 py-3 pr-3 pl-3 text-[12.5px] font-medium text-primary hover:underline"
      >
        Open in Mail →
      </Link>
    </PaneCard>
  );
}
