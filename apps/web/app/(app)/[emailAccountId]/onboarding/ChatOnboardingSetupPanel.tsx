"use client";

import { useMemo } from "react";
import { CheckIcon, TrendingUpIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ButtonLoader } from "@/components/Loading";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  IconCircle,
  type IconCircleColor,
} from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";
import { UnsubscribeSuggestionRow } from "@/app/(app)/[emailAccountId]/onboarding/UnsubscribeSuggestionRow";
import type { Newsletter } from "@/app/(app)/[emailAccountId]/onboarding/useInboxScan";
import type {
  OnboardingRuleAction,
  OnboardingSetup,
} from "@/app/api/chat/onboarding/validation";
import { categoryConfig } from "@/utils/category-config";
import { cn } from "@/utils";

const ACTION_LABELS: Record<OnboardingRuleAction, string> = {
  label: "Label",
  label_archive: "Label + archive",
  move_folder: "Move to folder",
};

export type CleanupState = {
  visible: boolean;
  senders: Newsletter[];
  deselected: Set<string>;
  onToggleSender: (name: string) => void;
  selectedCount: number;
  onUnsubscribe: () => void;
  submitting: boolean;
  // Null until the user acts; then the result line replaces the buttons
  result: { unsubscribedCount: number } | null;
};

export function ChatOnboardingSetupPanel({
  setup,
  provider,
  editable,
  onChangeAction,
  onToggleRule,
  cleanup,
  className,
}: {
  setup: OnboardingSetup;
  provider: string;
  editable: boolean;
  onChangeAction: (name: string, action: OnboardingRuleAction) => void;
  onToggleRule: (name: string) => void;
  cleanup: CleanupState;
  className?: string;
}) {
  const iconByKey = useMemo(() => {
    const map = new Map<
      string,
      { Icon: React.ElementType; iconColor: IconCircleColor }
    >();
    for (const category of categoryConfig(provider)) {
      map.set(category.key, {
        Icon: category.Icon,
        iconColor: category.iconColor,
      });
    }
    return map;
  }, [provider]);

  const isLive = setup.status === "live";
  const shownRules = isLive
    ? setup.rules.filter((rule) => rule.enabled)
    : setup.rules;

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col overflow-hidden bg-background",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
        <div className="text-base font-semibold tracking-tight">Your setup</div>
        <StatusBadge status={setup.status} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-3">
        <div className="px-5 pb-1.5 text-xs font-semibold text-muted-foreground">
          Rules
        </div>
        {shownRules.map((rule, index) => {
          const icon = rule.key ? iconByKey.get(rule.key) : null;
          return (
            <div
              key={rule.name}
              className={cn(
                "flex items-center gap-3 px-5 py-1.5",
                "duration-300 animate-in fade-in slide-in-from-bottom-2 fill-mode-backwards",
                !rule.enabled && "opacity-50",
              )}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <IconCircle
                size="sm"
                color={icon?.iconColor ?? "green"}
                Icon={icon?.Icon ?? TrendingUpIcon}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="truncate text-sm font-medium">
                  {rule.name}
                </span>
                {rule.addedByAssistant && (
                  <span className="shrink-0 rounded-md bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                    Added for you
                  </span>
                )}
              </div>
              {isLive ? (
                <CheckIcon className="size-4 shrink-0 text-green-600" />
              ) : (
                <>
                  <Select
                    value={rule.action}
                    onValueChange={(action) =>
                      onChangeAction(rule.name, action as OnboardingRuleAction)
                    }
                    disabled={!editable || !rule.enabled}
                  >
                    <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {actionOptions(rule.action).map((action) => (
                        <SelectItem
                          key={action}
                          value={action}
                          className="text-xs"
                        >
                          {ACTION_LABELS[action]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={() => onToggleRule(rule.name)}
                    disabled={!editable}
                    aria-label={`Toggle ${rule.name}`}
                  />
                </>
              )}
            </div>
          );
        })}
        {!isLive && (
          <p className="px-5 pt-2 text-xs text-muted-foreground/70">
            Custom labels come later, in Settings
          </p>
        )}

        {cleanup.visible && (
          <div className="mt-3 border-t pt-3 duration-300 animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-baseline justify-between px-5 pb-1.5">
              <span className="text-xs font-semibold text-muted-foreground">
                Cleanup
              </span>
              {!cleanup.result && (
                <span className="text-xs text-muted-foreground">
                  {cleanup.selectedCount} of {cleanup.senders.length} selected
                </span>
              )}
            </div>
            {cleanup.result ? (
              <div className="flex items-center gap-2 px-5 py-1.5 text-sm">
                <CheckIcon className="size-4 text-green-600" />
                {cleanup.result.unsubscribedCount > 0
                  ? `Unsubscribed from ${cleanup.result.unsubscribedCount} ${
                      cleanup.result.unsubscribedCount === 1
                        ? "newsletter"
                        : "newsletters"
                    }`
                  : "Kept all newsletters"}
              </div>
            ) : (
              <>
                {cleanup.senders.map((sender) => (
                  <UnsubscribeSuggestionRow
                    key={sender.name}
                    sender={sender}
                    checked={!cleanup.deselected.has(sender.name)}
                    onToggle={() => cleanup.onToggleSender(sender.name)}
                    clickable
                    iconSize={28}
                    progressClassName="w-14"
                    labelClassName="w-12"
                    className="cursor-pointer px-5 py-1.5 hover:bg-muted/50"
                  />
                ))}
                <div className="flex items-center gap-4 px-5 pb-2 pt-3">
                  <Button
                    onClick={cleanup.onUnsubscribe}
                    disabled={cleanup.submitting}
                  >
                    {cleanup.submitting && <ButtonLoader />}
                    {cleanup.selectedCount > 0
                      ? `Unsubscribe from ${cleanup.selectedCount}`
                      : "Keep them all"}
                  </Button>
                  {cleanup.selectedCount > 0 && (
                    <button
                      type="button"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => {
                        for (const sender of cleanup.senders) {
                          if (!cleanup.deselected.has(sender.name)) {
                            cleanup.onToggleSender(sender.name);
                          }
                        }
                      }}
                    >
                      Keep them all
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: OnboardingSetup["status"] }) {
  switch (status) {
    case "draft":
      return (
        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          Draft
        </span>
      );
    case "enabling":
      return (
        <span className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <ButtonLoader />
          Turning on
        </span>
      );
    case "live":
      return (
        <span className="flex items-center gap-1.5 rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
          <span className="size-1.5 rounded-full bg-green-600" />
          Live
        </span>
      );
    case "error":
      return (
        <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-400">
          Finish in app
        </span>
      );
  }
}

function actionOptions(current: OnboardingRuleAction): OnboardingRuleAction[] {
  const options: OnboardingRuleAction[] = ["label", "label_archive"];
  return options.includes(current) ? options : [current, ...options];
}
