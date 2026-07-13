"use client";

import { ButtonCheckbox } from "@/components/ButtonCheckbox";
import { DomainIcon } from "@/components/charts/DomainIcon";
import { Progress } from "@/components/ui/progress";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { extractDomainFromEmail } from "@/utils/email";
import { cn } from "@/utils";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

export function UnsubscribeSuggestionRow({
  sender,
  checked,
  onToggle,
  clickable = false,
  className,
  iconSize = 32,
  progressClassName = "w-16",
  labelClassName = "w-14",
}: {
  sender: Newsletter;
  checked: boolean;
  onToggle: () => void;
  clickable?: boolean;
  className?: string;
  iconSize?: number;
  progressClassName?: string;
  labelClassName?: string;
}) {
  const content = (
    <>
      <ButtonCheckbox
        label={`Select ${sender.fromName || sender.name}`}
        checked={checked}
        onChange={onToggle}
      />

      <DomainIcon
        domain={extractDomainFromEmail(sender.name) || sender.name}
        size={iconSize}
        variant="circular"
      />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">
          {sender.fromName || sender.name}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {sender.value} {sender.value === 1 ? "email" : "emails"}
        </div>
      </div>

      <ReadPercentage
        sender={sender}
        progressClassName={progressClassName}
        labelClassName={labelClassName}
      />
    </>
  );

  if (clickable) {
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: the row only enlarges the ButtonCheckbox's click target; keyboard users toggle via the focusable checkbox
      <div
        onClick={onToggle}
        className={cn("flex items-center gap-3", className)}
      >
        {content}
      </div>
    );
  }

  return (
    <li className={cn("flex items-center gap-3", className)}>{content}</li>
  );
}

function ReadPercentage({
  sender,
  progressClassName,
  labelClassName,
}: {
  sender: Newsletter;
  progressClassName: string;
  labelClassName: string;
}) {
  const readPercentage =
    sender.value > 0 ? Math.round((sender.readEmails / sender.value) * 100) : 0;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Progress
        value={readPercentage}
        className={cn(
          "h-1.5 bg-amber-100 dark:bg-amber-950",
          progressClassName,
        )}
        innerClassName="bg-amber-400"
      />
      <span
        className={cn(
          "whitespace-nowrap text-xs tabular-nums text-amber-600 dark:text-amber-400",
          labelClassName,
        )}
      >
        {readPercentage}% read
      </span>
    </div>
  );
}
