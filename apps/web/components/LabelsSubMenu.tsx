import {
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { EmailLabel } from "@/providers/EmailProvider";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getEmailTerminology } from "@/utils/terminology";

export function LabelsSubMenu({
  labels,
  onClick,
}: {
  labels: EmailLabel[];
  onClick: (label: EmailLabel) => void;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

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
        <DropdownMenuItem>
          You don't have any {terminology.label.plural} yet.
        </DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
