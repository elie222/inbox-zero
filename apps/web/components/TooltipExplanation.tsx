import { HelpCircleIcon } from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils";

const tooltipIconVariants = cva("cursor-pointer", {
  variants: {
    size: {
      sm: "h-4 w-4",
      md: "h-5 w-5",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

interface TooltipExplanationProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof tooltipIconVariants> {
  text: string;
}

export function TooltipExplanation({
  text,
  size,
  className,
}: TooltipExplanationProps) {
  return (
    <Tooltip content={text}>
      <HelpCircleIcon
        className={cn(tooltipIconVariants({ size }), className)}
      />
    </Tooltip>
  );
}
