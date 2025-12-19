import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import type { ReactNode } from "react";

export function RuleSteps({
  children,
  onAdd,
  addButtonLabel,
  addButtonDisabled = false,
  addButtonTooltip,
}: {
  children: ReactNode;
  onAdd: () => void;
  addButtonLabel: string;
  addButtonDisabled?: boolean;
  addButtonTooltip?: string;
}) {
  return (
    <div className="px-4 pb-4 space-y-2">
      {children}
      <div>
        <Tooltip hide={!addButtonTooltip} content={addButtonTooltip || ""}>
          <span>
            <Button
              variant="ghost"
              size="sm"
              onClick={onAdd}
              disabled={addButtonDisabled}
              Icon={PlusIcon}
            >
              {addButtonLabel}
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
