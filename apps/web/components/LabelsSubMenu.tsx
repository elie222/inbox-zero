import {
  DropdownMenuSubContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { CheckIcon } from "lucide-react";
import type { EmailLabel } from "@/providers/email-label-types";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getEmailTerminology } from "@/utils/terminology";

export function LabelsSubMenu({
  labels,
  onClick,
  isLabelActive,
}: {
  labels: EmailLabel[];
  onClick: (label: EmailLabel) => void;
  isLabelActive?: (label: EmailLabel) => boolean;
}) {
  const { provider } = useAccount();
  const terminology = getEmailTerminology(provider);

  return (
    <DropdownMenuSubContent className="max-h-[415px] overflow-auto">
      {labels.length ? (
        labels.map((label) => {
          const active = isLabelActive?.(label);

          return (
            <DropdownMenuItem
              key={label.id}
              onClick={() => onClick(label)}
              className="flex items-center justify-between gap-3"
            >
              <span className="truncate">{label.name}</span>
              {active && <CheckIcon className="size-4 text-primary" />}
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
