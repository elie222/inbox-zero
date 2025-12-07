"use client";

import { TabSelect } from "@/components/TabSelect";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HorizontalBarChart } from "@/components/charts/HorizontalBarChart";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/utils";

interface BarListCardProps {
  tabs: {
    id: string;
    label: string;
    data: { name: string; value: number; href?: string; target?: string }[];
  }[];
  icon: React.ReactNode;
  title: string;
}

export function BarListCard({ tabs, icon, title }: BarListCardProps) {
  const [selected, setSelected] = useState<string | null>(
    tabs?.length > 0 ? tabs[0]?.id : null,
  );

  const selectedTabData = tabs.find((d) => d.id === selected)?.data || [];

  return (
    <Card className="h-full bg-background relative overflow-x-hidden w-full max-w-full">
      <CardHeader className="p-0 overflow-x-hidden">
        <div className="px-3 sm:px-5 flex items-center justify-between border-b border-neutral-200 min-w-0 gap-2">
          <div className="min-w-0 flex-1">
            <TabSelect
              options={tabs.map((d) => ({ id: d.id, label: d.label }))}
              onSelect={(id: string) => setSelected(id)}
              selected={selected}
            />
          </div>
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {icon}
            <p className="text-xs text-neutral-500 whitespace-nowrap">
              {title.toUpperCase()}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-5 pb-0 px-3 sm:px-5 overflow-hidden overflow-x-hidden h-[330px] max-w-full w-full">
        <div
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 w-full h-1/2 z-20 rounded-[0.44rem]",
            "bg-gradient-to-b from-transparent to-white dark:to-black",
          )}
        />
        {selectedTabData.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="text-center space-y-2 px-4">
              <div className="text-muted-foreground text-sm">
                No data available
              </div>
              <p className="text-xs text-muted-foreground/70">
                Select a different time period to view statistics
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="w-full min-w-0 max-w-full overflow-x-hidden">
              <HorizontalBarChart data={selectedTabData} />
            </div>
            <div className="absolute w-full left-0 bottom-0 pb-6 z-30 px-3 sm:px-5">
              <div className="flex justify-center max-w-full">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="xs-2">
                      View more
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl p-0 gap-0">
                    <DialogHeader className="px-6 py-4 border-b border-neutral-200">
                      <div className="flex items-center gap-2">
                        {icon}
                        <DialogTitle className="text-base text-neutral-900 font-medium">
                          {title}
                        </DialogTitle>
                      </div>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto p-6">
                      <HorizontalBarChart data={selectedTabData} />
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
