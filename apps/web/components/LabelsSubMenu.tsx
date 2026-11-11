import { Trans } from "@lingui/react/macro";
import {
  DropdownMenuSubContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import type { EmailLabel } from "@/providers/email-label-types";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

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
  const isOutlook = isMicrosoftProvider(provider);

  return (
    <DropdownMenuSubContent className="max-h-[415px] overflow-auto">
      {labels.length ? (
        labels.map((label) => {
          const active = isLabelActive?.(label);

          return (
            <DropdownMenuCheckboxItem
              key={label.id}
              checked={active}
              onCheckedChange={() => onClick(label)}
              className="gap-3"
            >
              <span className="truncate">{label.name}</span>
            </DropdownMenuCheckboxItem>
          );
        })
      ) : (
        <DropdownMenuItem>
          {isOutlook ? (
            <Trans>You don't have any categories yet.</Trans>
          ) : (
            <Trans>You don't have any labels yet.</Trans>
          )}
        </DropdownMenuItem>
      )}
    </DropdownMenuSubContent>
  );
}
