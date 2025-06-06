"use client";

import { useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { cn } from "@/utils";

export interface SlashCommandItem {
  title: string;
  description: string;
  command: (props: any) => void;
}

interface SlashCommandListProps {
  items: SlashCommandItem[];
  command: (item: SlashCommandItem) => void;
}

export const SlashCommandList = forwardRef<any, SlashCommandListProps>(
  ({ items, command }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);

    const selectItem = (index: number) => {
      const item = items[index];
      if (item) {
        command(item);
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (event.key === "ArrowUp") {
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          return true;
        }

        if (event.key === "ArrowDown") {
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return true;
        }

        if (event.key === "Enter") {
          selectItem(selectedIndex);
          return true;
        }

        return false;
      },
    }));

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {items.map((item, index) => (
          <button
            key={index}
            className={cn(
              "flex w-full items-start gap-3 px-4 py-2 text-left transition-colors",
              index === selectedIndex
                ? "bg-gray-100 text-gray-900"
                : "text-gray-700 hover:bg-gray-50",
            )}
            onClick={() => selectItem(index)}
          >
            <div>
              <div className="font-medium">{item.title}</div>
              <div className="text-sm text-gray-500">{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    );
  },
);

SlashCommandList.displayName = "SlashCommandList";
