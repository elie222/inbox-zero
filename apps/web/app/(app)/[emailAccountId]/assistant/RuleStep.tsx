import { Button } from "@/components/ui/button";
import { TrashIcon } from "lucide-react";
import { cn } from "@/utils";

function RemoveButton({
  onClick,
  ariaLabel,
}: {
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      className="size-8"
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <TrashIcon className="size-4 text-muted-foreground" />
    </Button>
  );
}

function CardLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col sm:flex-row gap-4">{children}</div>;
}

function CardLayoutLeft({ children }: { children: React.ReactNode }) {
  return <div className="w-[200px]">{children}</div>;
}

function CardLayoutRight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4 mx-auto w-full", className)}>{children}</div>
  );
}

export function RuleStep({
  onRemove,
  leftContent,
  rightContent,
  removeAriaLabel,
}: {
  onRemove: () => void;
  leftContent: React.ReactNode;
  rightContent: React.ReactNode;
  removeAriaLabel: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative flex-1">
        <CardLayout>
          <CardLayoutLeft>{leftContent}</CardLayoutLeft>
          <CardLayoutRight>{rightContent}</CardLayoutRight>
          <RemoveButton onClick={onRemove} ariaLabel={removeAriaLabel} />
        </CardLayout>
      </div>
    </div>
  );
}
