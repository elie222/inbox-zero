import { Button } from "@/components/ui/button";
import {
  TrashIcon,
  MoreHorizontalIcon,
  ClockIcon,
  SparklesIcon,
  PenLineIcon,
} from "lucide-react";
import { cn } from "@/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function DeleteButton({
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
      className="size-8 mt-1"
      aria-label={ariaLabel}
      onClick={onClick}
    >
      <TrashIcon className="size-4 text-muted-foreground" />
    </Button>
  );
}

function OptionsMenu({
  onAddDelay,
  onRemoveDelay,
  hasDelay,
  onUsePrompt,
  onUseLabel,
  isPromptMode,
  onSetManually,
  onUseAiDraft,
  isManualMode,
}: {
  onAddDelay?: () => void;
  onRemoveDelay?: () => void;
  hasDelay?: boolean;
  onUsePrompt?: () => void;
  onUseLabel?: () => void;
  isPromptMode?: boolean;
  onSetManually?: () => void;
  onUseAiDraft?: () => void;
  isManualMode?: boolean;
}) {
  const hasOptions =
    onAddDelay ||
    onRemoveDelay ||
    onUsePrompt ||
    onUseLabel ||
    onSetManually ||
    onUseAiDraft;

  if (!hasOptions) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 mt-1"
          aria-label="More options"
        >
          <MoreHorizontalIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {onUsePrompt && !isPromptMode && (
          <DropdownMenuItem onClick={onUsePrompt}>
            <SparklesIcon className="mr-2 size-4" />
            Use prompt
          </DropdownMenuItem>
        )}
        {onUseLabel && isPromptMode && (
          <DropdownMenuItem onClick={onUseLabel}>
            <SparklesIcon className="mr-2 size-4" />
            Use label
          </DropdownMenuItem>
        )}
        {onSetManually && !isManualMode && (
          <DropdownMenuItem onClick={onSetManually}>
            <PenLineIcon className="mr-2 size-4" />
            Set content manually
          </DropdownMenuItem>
        )}
        {onUseAiDraft && isManualMode && (
          <DropdownMenuItem onClick={onUseAiDraft}>
            <SparklesIcon className="mr-2 size-4" />
            Use AI draft
          </DropdownMenuItem>
        )}
        {onAddDelay && !hasDelay && (
          <DropdownMenuItem onClick={onAddDelay}>
            <ClockIcon className="mr-2 size-4" />
            Add delay
          </DropdownMenuItem>
        )}
        {onRemoveDelay && hasDelay && (
          <DropdownMenuItem onClick={onRemoveDelay}>
            <ClockIcon className="mr-2 size-4" />
            Remove delay
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ActionButtons({
  onRemove,
  removeAriaLabel,
  onAddDelay,
  onRemoveDelay,
  hasDelay,
  onUsePrompt,
  onUseLabel,
  isPromptMode,
  onSetManually,
  onUseAiDraft,
  isManualMode,
}: {
  onRemove: () => void;
  removeAriaLabel: string;
  onAddDelay?: () => void;
  onRemoveDelay?: () => void;
  hasDelay?: boolean;
  onUsePrompt?: () => void;
  onUseLabel?: () => void;
  isPromptMode?: boolean;
  onSetManually?: () => void;
  onUseAiDraft?: () => void;
  isManualMode?: boolean;
}) {
  return (
    <div className="flex items-start">
      <OptionsMenu
        onAddDelay={onAddDelay}
        onRemoveDelay={onRemoveDelay}
        hasDelay={hasDelay}
        onUsePrompt={onUsePrompt}
        onUseLabel={onUseLabel}
        isPromptMode={isPromptMode}
        onSetManually={onSetManually}
        onUseAiDraft={onUseAiDraft}
        isManualMode={isManualMode}
      />
      <DeleteButton onClick={onRemove} ariaLabel={removeAriaLabel} />
    </div>
  );
}

function CardLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col sm:flex-row gap-2">{children}</div>;
}

function CardLayoutRight({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2 mx-auto w-full", className)}>{children}</div>
  );
}

export function RuleStep({
  onRemove,
  leftContent,
  rightContent,
  removeAriaLabel,
  onAddDelay,
  onRemoveDelay,
  hasDelay,
  onUsePrompt,
  onUseLabel,
  isPromptMode,
  onSetManually,
  onUseAiDraft,
  isManualMode,
}: {
  onRemove: () => void;
  leftContent: React.ReactNode | null;
  rightContent: React.ReactNode;
  removeAriaLabel: string;
  onAddDelay?: () => void;
  onRemoveDelay?: () => void;
  hasDelay?: boolean;
  onUsePrompt?: () => void;
  onUseLabel?: () => void;
  isPromptMode?: boolean;
  onSetManually?: () => void;
  onUseAiDraft?: () => void;
  isManualMode?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="relative flex-1">
        <CardLayout>
          {leftContent && <div className="shrink-0">{leftContent}</div>}
          <CardLayoutRight>{rightContent}</CardLayoutRight>
          <ActionButtons
            onRemove={onRemove}
            removeAriaLabel={removeAriaLabel}
            onAddDelay={onAddDelay}
            onRemoveDelay={onRemoveDelay}
            hasDelay={hasDelay}
            onUsePrompt={onUsePrompt}
            onUseLabel={onUseLabel}
            isPromptMode={isPromptMode}
            onSetManually={onSetManually}
            onUseAiDraft={onUseAiDraft}
            isManualMode={isManualMode}
          />
        </CardLayout>
      </div>
    </div>
  );
}
