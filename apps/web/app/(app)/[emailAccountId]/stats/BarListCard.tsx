"use client";

import { TabSelect } from "@/components/TabSelect";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { useState } from "react";

interface BarListCardProps {
  tabs: { id: string; label: string; data: any }[]; // TODO: add type
  extra: any; // TODO: add type
  icon: React.ReactNode;
  title: string;
}

export function BarListCard({ tabs, extra, icon, title }: BarListCardProps) {
  const [selected, setSelected] = useState<string | null>(
    tabs?.length > 0 ? tabs[0]?.id : null,
  );

  return (
    <Card className="h-full bg-background">
      <CardHeader className="p-0">
        <div className="px-5 flex items-center justify-between border-b border-neutral-200">
          <TabSelect
            options={tabs.map((d) => ({ id: d.id, label: d.label }))}
            onSelect={(id: string) => setSelected(id)}
            selected={selected}
          />
          <div className="flex items-center gap-2">
            {icon}
            <p className="text-xs text-neutral-500">{title}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 px-5">
        <HorizontalBarChart
          data={tabs.find((d) => d.id === selected)?.data || []}
        />
        {extra}
      </CardContent>
    </Card>
  );
}
