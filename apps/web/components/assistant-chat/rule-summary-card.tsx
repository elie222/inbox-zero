"use client";

import type { ReactNode } from "react";
import { cn } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function RuleSummaryCard({
  title,
  status,
  actions,
  children,
}: {
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <RuleSummaryCardHeader title={title} status={status} actions={actions} />
      <CardContent className="space-y-3 px-4 py-3.5">{children}</CardContent>
    </Card>
  );
}

export function RuleSummaryCardHeader({
  title,
  status,
  actions,
}: {
  title: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="truncate text-base font-semibold">{title}</h3>
        {status}
      </div>
      {actions}
    </CardHeader>
  );
}

export function RuleSummaryRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-4 text-sm">
      <RuleSummaryLabel className="pt-0.5">{label}</RuleSummaryLabel>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function RuleSummaryText({ children }: { children: ReactNode }) {
  return <p className="whitespace-pre-wrap break-words">{children}</p>;
}

export function RuleSummaryLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
