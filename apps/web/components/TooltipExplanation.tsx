import { Tooltip } from "@/components/Tooltip";
import { HelpCircleIcon } from "lucide-react";

export function TooltipExplanation({ text }: { text: string }) {
  return (
    <Tooltip content={text}>
      <HelpCircleIcon className="h-4 w-4 cursor-pointer" />
    </Tooltip>
  );
}
