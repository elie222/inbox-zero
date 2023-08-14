import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TooltipProps {
  children: React.ReactElement;
  content?: string;
}

export const Tooltip = (props: TooltipProps) => {
  return (
    <TooltipProvider delayDuration={200}>
      <ShadcnTooltip>
        <TooltipTrigger asChild>{props.children}</TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs">{props.content}</p>
        </TooltipContent>
      </ShadcnTooltip>
    </TooltipProvider>
  );
};
