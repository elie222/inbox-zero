import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/Input";
import { cn } from "@/utils";

type ButtonListItem = {
  id: string;
  name: string;
};

interface ButtonListProps {
  title?: string;
  items: ButtonListItem[];
  onSelect: (id: string) => void;
  selectedId?: string;
  emptyMessage: string;
  columns?: number;
}

export function ButtonList({
  title,
  items,
  onSelect,
  selectedId,
  emptyMessage,
  columns = 1,
}: ButtonListProps) {
  return (
    <div>
      {title && <Label name={title} label={title} />}

      {!items.length && (
        <SectionDescription className="mt-2">{emptyMessage}</SectionDescription>
      )}

      <div
        className={cn("mt-1 grid gap-1", {
          "grid-cols-2": columns === 2,
          "grid-cols-3": columns === 3,
        })}
      >
        {items.map((item) => (
          <Button
            key={item.id}
            variant={selectedId === item.id ? "default" : "outline"}
            onClick={() => onSelect(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
