"use client";

import { CheckIcon } from "lucide-react";
import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/Input";

type ButtonListItem = {
  id: string;
  name: string;
};

interface ButtonListMultiSelectProps {
  title?: string;
  items: ButtonListItem[];
  onSelectionChange: (selectedIds: string[]) => void;
  selectedIds: string[];
  emptyMessage: string;
  columns?: number;
}

export function ButtonListMultiSelect({
  title,
  items,
  onSelectionChange,
  selectedIds,
  emptyMessage,
  columns = 1,
}: ButtonListMultiSelectProps) {
  const handleItemClick = (id: string) => {
    const isSelected = selectedIds.includes(id);
    if (isSelected) {
      onSelectionChange(selectedIds.filter((selectedId) => selectedId !== id));
    } else {
      onSelectionChange([...selectedIds, id]);
    }
  };

  return (
    <div>
      {title && <Label name={title} label={title} />}

      {!items.length && (
        <SectionDescription className="mt-2">{emptyMessage}</SectionDescription>
      )}

      <div className="mt-1 grid gap-1">
        {items.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          return (
            <Button
              key={item.id}
              variant={isSelected ? "default" : "outline"}
              onClick={() => handleItemClick(item.id)}
              className="relative"
            >
              {isSelected && <CheckIcon className="mr-2 size-4" />}
              {item.name}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
