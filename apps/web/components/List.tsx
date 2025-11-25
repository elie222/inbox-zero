import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

type ListItem = {
  label: string;
  value: string;
};

interface ListProps {
  items: ListItem[];
  className?: string;
  value?: string;
  onSelect: (item: ListItem) => void;
}

export function List({ items, className, value, onSelect }: ListProps) {
  return (
    <div className={cn("flex flex-col", className)}>
      {items.map((item) => {
        const isSelected = value === item.value;

        return (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "text-left justify-start",
              isSelected ? "font-bold" : "font-normal",
            )}
            onClick={() => onSelect?.(item)}
            key={item.value}
          >
            {item.label}
          </Button>
        );
      })}
    </div>
  );
}
