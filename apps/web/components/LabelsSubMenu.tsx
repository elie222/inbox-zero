import {
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { EmailLabel } from "@/providers/EmailProvider";

export function LabelsSubMenu({
  labels,
  onClick,
}: {
  labels: EmailLabel[];
  onClick: (label: EmailLabel) => void;
}) {
  return (
    <DropdownMenuSubContent className="max-h-[415px] overflow-auto">
      {labels.length ? (
        labels.map((label) => {
          return (
            <DropdownMenuItem key={label.id} onClick={() => onClick(label)}>
              {label.name}
            </DropdownMenuItem>
          );
        })
      ) : (
        <DropdownMenuItem>You don't have any labels yet.</DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
