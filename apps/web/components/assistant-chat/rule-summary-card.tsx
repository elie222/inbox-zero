"use client";

import type { ReactNode } from "react";
import { cn } from "@/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function RuleSummaryCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <RuleSummaryCardHeader title={title} actions={actions} />
      <CardContent className="space-y-3 px-4 py-3.5">{children}</CardContent>
    </Card>
  );
}

export function RuleSummaryCardHeader({
  title,
  actions,
}: {
  title: string;
  actions?: ReactNode;
}) {
  return (
    <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b px-4 py-3.5">
      <h3 className="text-base font-semibold">{title}</h3>
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
