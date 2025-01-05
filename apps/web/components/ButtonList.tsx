import { SectionDescription } from "@/components/Typography";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/Input";

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
}

export function ButtonList({
  title,
  items,
  onSelect,
  selectedId,
  emptyMessage,
}: ButtonListProps) {
  return (
    <div>
      {title && <Label name={title} label={title} />}

      {!items.length && (
        <SectionDescription className="mt-2">{emptyMessage}</SectionDescription>
      )}

      <div className="mt-1 flex flex-col gap-1">
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
